// src/np/np-ttn.service.ts

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { NpClient } from "./np-client.service";
import type { CreateNpTtnDto, NpParcelDto } from "./dto/create-np-ttn.dto";
import { NpDeliveryType, NpRecipientType } from "./dto/create-np-ttn.dto";
import { Prisma } from "@prisma/client";
import type {
  Carrier,
  OrderStage,
  OrderStatus as PrismaOrderStatus,
  ShipmentStatus,
} from "@prisma/client";
import {
  computeFinancialStatusFromOrder,
  legacyStatusToOrderUpdate,
  orderStageToLegacyStatus,
} from "../orders/order-status-sync.mapper";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { kyivWallToUtc } from "../crm-timezone";
import { orderAmountToUah } from "../common/currency.util";

type SenderCache = {
  senderCityRef: string;
  senderWarehouseRef: string;
  senderCounterpartyRef: string;
  senderContactRef: string;
  senderPhone: string;
  senderAddressName?: string; // только для debug, в payload не отправляем
};

/** First TTN on a NEW order: advance stage without using CONFIRMED (that comes after stock). */
function orderStageAfterFirstTtnFromNew(order: {
  paymentType: string | null;
  paidAmount: unknown;
  totalAmount: unknown;
}): OrderStage {
  if (order.paymentType === "PREPAYMENT") {
    const total = Number(order.totalAmount ?? 0);
    const paid = Number(order.paidAmount ?? 0);
    if (total > 0.00001 && paid < total - 0.00001) return "AWAITING_PAYMENT";
  }
  return "AWAITING_STOCK";
}

type OrderStatus =
  | "NEW"
  | "IN_WORK"
  | "READY_TO_SHIP"
  | "SHIPPED"
  | "CONTROL_PAYMENT"
  | "SUCCESS"
  | "RETURNING"
  | "CANCELED";

@Injectable()
export class NpTtnService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly np: NpClient,
    private readonly settings: SettingsService,
  ) {}

  // ======================
  // PUBLIC: TTN form defaults
  // ======================
  async getTtnDefaults() {
    return this.settings.resolveNovaPoshtaFinancialDefaults();
  }

  // ======================
  // PUBLIC: create TTN
  // ======================
  async createFromOrder(orderId: string, dto: CreateNpTtnDto) {
    if (process.env.NP_WRITES_DISABLED === "true") {
      throw new ServiceUnavailableException(
        "NP writes are disabled on this instance (use crm-module-np or unset NP_WRITES_DISABLED).",
      );
    }
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { contact: true, client: true },
    });

    if (!order) throw new BadRequestException("order not found");

    // ✅ fallback: если contactId не задан — берём clientId
    const contactId = order.contactId ?? order.clientId ?? null;

    if (!contactId) {
      throw new BadRequestException("order.contactId or order.clientId is required");
    }

    // ✅ если в заказе contactId пустой, но есть clientId — сохраним contactId в заказ
    // чтобы дальше всё работало (и UI мог всегда передавать order.contactId)
    if (!order.contactId && order.clientId) {
      await this.prisma.order.update({
        where: { id: order.id },
        data: { contactId: order.clientId },
      });
    }

    const existingTtnForOrder = await this.prisma.orderTtn.findFirst({
      where: {
        carrier: "NOVA_POSHTA" as Carrier,
        OR: [{ orderId: order.id }, { shipment: { orderId: order.id } }],
      },
      select: { documentNumber: true },
    });
    if (existingTtnForOrder) {
      throw new ConflictException(
        `У замовленні вже є ТТН №${existingTtnForOrder.documentNumber}. Скасуйте її в НП або видаліть її з замовлення перед створенням нової.`,
      );
    }

    const resolved = await this.resolveRecipientData(contactId, dto);

    const resolvedData = resolved.data as Record<string, unknown>;
    const debugPhoneRaw =
      resolvedData.recipientType === NpRecipientType.PERSON
        ? String(resolvedData.phone ?? "")
        : String(resolvedData.contactPersonPhone ?? "");
    const debugPhoneDigits = debugPhoneRaw.replace(/\D/g, "");
    const debugPhoneLast4 = debugPhoneDigits.slice(-4);
    const debugCityRef = String(resolvedData.cityRef ?? "");
    const debugWarehouseRef = String(resolvedData.warehouseRef ?? "");
    const duplicateCandidates = await this.prisma.orderTtn.findMany({
      where: {
        carrier: "NOVA_POSHTA" as Carrier,
        shipment: { isNot: null },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        documentNumber: true,
        statusCode: true,
        statusText: true,
        shipment: {
          select: {
            id: true,
            orderId: true,
            recipientSnapshot: true,
          },
        },
      },
    });
    const matchedCandidates = duplicateCandidates.filter((c) => {
      const snap = (c.shipment?.recipientSnapshot ?? {}) as Record<string, unknown>;
      const snapPhoneRaw =
        snap.recipientType === NpRecipientType.PERSON
          ? String(snap.phone ?? "")
          : String(snap.contactPersonPhone ?? "");
      const snapPhoneDigits = snapPhoneRaw.replace(/\D/g, "");
      const snapCityRef = String(snap.cityRef ?? "");
      const snapWarehouseRef = String(snap.warehouseRef ?? "");
      return (
        !!snapPhoneDigits &&
        snapPhoneDigits === debugPhoneDigits &&
        snapCityRef === debugCityRef &&
        snapWarehouseRef === debugWarehouseRef
      );
    });
    const duplicateUnsent = matchedCandidates
      .filter((m) => !m.statusCode || String(m.statusCode) === "1")
      .filter((m) => m.shipment?.orderId && m.shipment.orderId !== orderId);
    if (duplicateUnsent.length > 0 && !dto.ignoreDuplicateCheck) {
      const first = duplicateUnsent[0]!;
      const duplicateOrder = first.shipment?.orderId
        ? await this.prisma.order.findUnique({
            where: { id: first.shipment.orderId },
            select: { orderNumber: true },
          })
        : null;
      const firstSnap = (first.shipment?.recipientSnapshot ?? {}) as Record<string, unknown>;
      const recipientLabel =
        firstSnap.recipientType === NpRecipientType.PERSON
          ? [firstSnap.lastName, firstSnap.firstName, firstSnap.phone]
              .map((v) => String(v ?? "").trim())
              .filter(Boolean)
              .join(" ")
          : [firstSnap.companyName, firstSnap.contactPersonPhone]
              .map((v) => String(v ?? "").trim())
              .filter(Boolean)
              .join(" ");
      throw new ConflictException({
        code: "DUPLICATE_UNSENT_TTN",
        message:
          `Знайдено незавершену ТТН №${first.documentNumber} у замовленні ${duplicateOrder?.orderNumber ?? first.shipment?.orderId ?? "іншому замовленні"}. ` +
          "Підтвердьте створення нової ТТН, якщо потрібно дублювати відправку.",
        duplicate: {
          documentNumber: first.documentNumber,
          orderId: first.shipment?.orderId ?? null,
          orderNumber: duplicateOrder?.orderNumber ?? null,
          recipientLabel: recipientLabel || null,
          shipmentId: first.shipment?.id ?? null,
        },
      });
    }
    const deliveryType = resolvedData.deliveryType as string | undefined;
    if (
      deliveryType === NpDeliveryType.WAREHOUSE ||
      deliveryType === NpDeliveryType.POSTOMAT
    ) {
      await this.tryResolveMissingNpRefsFromCache(resolvedData);
    }
    const cityRefVal = resolvedData.cityRef;
    const warehouseRefVal = resolvedData.warehouseRef;
    const missingRefs =
      (deliveryType === NpDeliveryType.WAREHOUSE || deliveryType === NpDeliveryType.POSTOMAT) &&
      (!cityRefVal || !warehouseRefVal);
    if (missingRefs) {
      throw new BadRequestException(
        "У профілі доставки відсутні CityRef або WarehouseRef. " +
          "Заповніть їх у картці контакта в Bitrix (поля Нова Пошта) або оберіть «Новий профіль» і вкажіть адресу вручну.",
      );
    }
    if (deliveryType === NpDeliveryType.WAREHOUSE || deliveryType === NpDeliveryType.POSTOMAT) {
      await this.enrichWarehouseRecipientData(resolvedData);
    }

    // 1) ensure NP entities (Recipient counterparty/contact/address)
    const npRefs = await this.ensureNpRecipientRefs(resolved);

    // 2) build payload
    const declaredCost = await this.resolveDeclaredCost(dto, order);
    const payload = await this.buildInternetDocumentPayload({
      dto: { ...dto, declaredCost },
      resolved,
      npRefs,
      orderNumber: order.orderNumber,
    });

    // 3) create document
    let doc: unknown;
    try {
      doc = await this.np.call<Record<string, unknown>>("InternetDocument", "save", payload);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new BadRequestException(`NP error: ${msg}`);
    }

    const docObj = doc as { data?: Array<Record<string, unknown>>; errors?: string[] };
    const docData = docObj?.data?.[0];
    if (!docData?.IntDocNumber) {
      const errors = Array.isArray(docObj?.errors) ? docObj.errors.join("; ") : "";
      throw new BadRequestException(
        `NP: no IntDocNumber in response${errors ? `. Errors: ${errors}` : ""}`,
      );
    }

    const shipment = await this.ensureShipmentForOrder({
      order,
      recipientSnapshot: resolved.data as Record<string, unknown>,
    });

    // 4) save TTN record (row lock on Order to avoid double-create under retries / split deploy)
    const saved = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM "Order" WHERE id = ${order.id} FOR UPDATE`);
      return tx.orderTtn.create({
        data: {
          orderId: order.id,
          shipmentId: shipment.id,
          carrier: "NOVA_POSHTA" as Carrier,
          documentNumber: String(docData.IntDocNumber ?? ""),
          documentRef: docData.Ref != null ? String(docData.Ref) : null,
          cost: docData.CostOnSite != null ? Number(docData.CostOnSite) : null,
          payloadSnapshot: { request: payload, response: doc } as Prisma.InputJsonValue,
        },
      });
    });

    // 4.5) persist TTN into Order.deliveryData (+ move NEW -> IN_WORK)
    await this.persistOrderDeliveryDataWithTtn(
      order,
      resolved as { data: Record<string, unknown> },
      saved,
    );

    // 5) persist profile updates (including NP refs)
    await this.upsertShippingProfile(
      contactId,
      dto,
      resolved as { data: Record<string, unknown> },
      npRefs,
    );

    return {
      ttnId: saved.id,
      documentNumber: saved.documentNumber,
      documentRef: saved.documentRef,
      cost: saved.cost,
    };
  }

  private async ensureShipmentForOrder(args: {
    order: { id: string; contactId?: string | null; clientId?: string | null; deliveryData?: unknown };
    recipientSnapshot?: Record<string, unknown>;
  }) {
    const { order, recipientSnapshot } = args;
    const existing = await this.prisma.shipment.findFirst({
      where: { orderId: order.id, status: { not: "CANCELED" as ShipmentStatus } },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      if (recipientSnapshot && Object.keys(recipientSnapshot).length > 0) {
        await this.prisma.shipment.update({
          where: { id: existing.id },
          data: {
            recipientSnapshot: recipientSnapshot as Prisma.InputJsonValue,
          },
        });
      }
      return existing;
    }

    const npFromOrder =
      ((order.deliveryData as Record<string, unknown> | null)?.novaPoshta as Record<string, unknown>) ??
      null;
    return this.prisma.shipment.create({
      data: {
        orderId: order.id,
        contactId: order.contactId ?? order.clientId ?? null,
        carrier: "NOVA_POSHTA" as Carrier,
        status: "DRAFT",
        recipientSnapshot:
          (recipientSnapshot as Prisma.InputJsonValue | undefined) ??
          (npFromOrder as Prisma.InputJsonValue | undefined),
      },
    });
  }

  // ======================
  // PUBLIC: debug sender
  // ======================
  async validateSenderRefs() {
    const sender = await this.getSenderRefsFromEnv();
    return {
      ok: true,
      senderCityRef: sender.senderCityRef,
      senderWarehouseRef: sender.senderWarehouseRef,
      senderCounterpartyRefPrefix: sender.senderCounterpartyRef.slice(0, 8),
      senderContactRefPrefix: sender.senderContactRef.slice(0, 8),
      senderPhone: sender.senderPhone,
      senderAddressName: sender.senderAddressName,
    };
  }

  // ==============================
  // Resolve data (profile or draft)
  // ==============================
  private async resolveRecipientData(contactId: string, dto: CreateNpTtnDto) {
    const profileId = typeof dto.profileId === "string" ? dto.profileId.trim() : "";
    if (profileId) {
      const profile = await this.prisma.contactShippingProfile.findUnique({
        where: { id: profileId },
      });
      if (!profile || profile.contactId !== contactId)
        throw new BadRequestException("profile not found");

      const data = { ...profile, ...(dto.draft ?? {}) };
      return { sourceProfile: profile, data };
    }

    if (!dto.draft) throw new BadRequestException("draft is required if profileId not provided");
    return { sourceProfile: null, data: dto.draft };
  }

  /**
   * For WAREHOUSE/POSTOMAT profiles that have cityName/warehouseNumber but missing
   * cityRef/warehouseRef (e.g. Bitrix profile without refs), try to resolve from NP cache.
   * Mutates resolvedData in place when refs are found.
   */
  private async tryResolveMissingNpRefsFromCache(
    resolvedData: Record<string, unknown>,
  ): Promise<void> {
    const cityName = resolvedData.cityName != null ? String(resolvedData.cityName).trim() : "";
    const warehouseNumber =
      resolvedData.warehouseNumber != null ? String(resolvedData.warehouseNumber).trim() : "";

    if (!resolvedData.cityRef && cityName) {
      const city = await this.prisma.npCity.findFirst({
        where: { description: cityName, isActive: true },
        select: { ref: true },
      });
      if (city) resolvedData.cityRef = city.ref;
    }

    const cityRef = resolvedData.cityRef != null ? String(resolvedData.cityRef).trim() : "";
    if (!resolvedData.warehouseRef && cityRef && warehouseNumber) {
      const wh = await this.prisma.npWarehouse.findFirst({
        where: { cityRef, number: warehouseNumber, isActive: true },
        select: { ref: true },
      });
      if (wh) resolvedData.warehouseRef = wh.ref;
    }
  }

  /**
   * Keep warehouse/postomat refs consistent before creating NP recipient entities.
   * Counterparty.save binds to CityRef, so city must match selected warehouse.
   */
  private async enrichWarehouseRecipientData(resolvedData: Record<string, unknown>): Promise<void> {
    const whRef = resolvedData.warehouseRef != null ? String(resolvedData.warehouseRef).trim() : "";
    if (!whRef) return;

    const wh = await this.prisma.npWarehouse.findUnique({ where: { ref: whRef } });
    if (!wh) throw new BadRequestException("warehouseRef not found in cache (NpWarehouse)");

    resolvedData.cityRef = wh.cityRef;
    const whExt = wh as Record<string, unknown>;
    resolvedData.warehouseNumber = String(whExt.number ?? "");
    resolvedData.warehouseType = whExt.isPostomat ? "POSTOMAT" : "WAREHOUSE";

    if (!resolvedData.cityName) {
      const city = await this.prisma.npCity.findUnique({ where: { ref: wh.cityRef } });
      resolvedData.cityName = city?.description ?? null;
    }
  }

  // =====================================
  // Sender: Settings (IntegrationSetting) or ENV refs + validation
  // =====================================
  private async getSenderRefsFromEnv(): Promise<SenderCache> {
    const merged = await this.settings.resolveNovaPoshtaSenderStrings();
    const senderCityRef = merged.senderCityRef;
    const senderWarehouseRef = merged.senderWarehouseRef;
    const senderCounterpartyRef = merged.senderCounterpartyRef;
    const senderContactRef = merged.senderContactRef;
    const senderPhoneEnv = merged.senderPhone;

    if (!senderCityRef) {
      throw new BadRequestException(
        "Sender city ref: set in Settings → Nova Poshta or NP_SENDER_CITY_REF in the environment.",
      );
    }
    if (!senderWarehouseRef) {
      throw new BadRequestException(
        "Sender warehouse ref: set in Settings → Nova Poshta or NP_SENDER_WAREHOUSE_REF in the environment.",
      );
    }
    if (!senderCounterpartyRef) {
      throw new BadRequestException(
        "Sender counterparty ref: set in Settings → Nova Poshta or NP_SENDER_COUNTERPARTY_REF in the environment.",
      );
    }
    if (!senderContactRef) {
      throw new BadRequestException(
        "Sender contact ref: set in Settings → Nova Poshta or NP_SENDER_CONTACT_REF in the environment.",
      );
    }
    if (!senderPhoneEnv) {
      throw new BadRequestException(
        "Sender phone: set in Settings → Nova Poshta or NP_SENDER_PHONE in the environment.",
      );
    }

    const city = await this.prisma.npCity.findUnique({ where: { ref: senderCityRef } });
    if (!city) {
      throw new BadRequestException(
        `Sender cityRef not found in cache: ${senderCityRef}. Run POST /np/sync`,
      );
    }

    const wh = await this.prisma.npWarehouse.findUnique({ where: { ref: senderWarehouseRef } });
    if (!wh) {
      throw new BadRequestException(
        `Sender warehouseRef not found in cache: ${senderWarehouseRef}. Run POST /np/sync`,
      );
    }

    if (wh.cityRef !== senderCityRef) {
      throw new BadRequestException(
        `Sender warehouseRef city mismatch: wh.cityRef=${wh.cityRef} vs sender cityRef=${senderCityRef}`,
      );
    }
    if ((wh as Record<string, unknown>).isPostomat) {
      throw new BadRequestException(
        "Sender warehouseRef points to postomat. Use real warehouse ref.",
      );
    }

    const cache: SenderCache = {
      senderCityRef,
      senderWarehouseRef,
      senderCounterpartyRef,
      senderContactRef,
      senderPhone: this.normalizeNpPhone(senderPhoneEnv),
      senderAddressName: String(
        (wh as Record<string, unknown>).shortAddress ?? wh.description ?? "",
      ),
    };

    return cache;
  }

  private normalizeNpPhone(phone: string) {
    const digits = String(phone || "").replace(/\D/g, "");
    if (digits.startsWith("380") && digits.length === 12) return digits;
    if (digits.startsWith("0") && digits.length === 10) return `38${digits}`;
    if (digits.length === 10) return `38${digits}`;
    return digits;
  }

  // ======================================
  // Recipient: counterparty/contact/address
  // ======================================
  private async ensureNpRecipientRefs(resolved: { data: unknown }) {
    const d = resolved.data as Record<string, unknown>;

    const refs = {
      counterpartyRef: d.npCounterpartyRef as string | undefined,
      contactPersonRef: d.npContactPersonRef as string | undefined,
      addressRef: d.npAddressRef as string | undefined, // only for ADDRESS
    };

    // Counterparty (Recipient)
    if (!refs.counterpartyRef) {
      const isPerson = d.recipientType === NpRecipientType.PERSON;
      if (!d.cityRef) throw new BadRequestException("Recipient cityRef is required");

      const cp = await this.np.call<Record<string, unknown>>("Counterparty", "save", {
        CounterpartyProperty: "Recipient",
        CounterpartyType: isPerson ? "PrivatePerson" : "Organization",
        CityRef: d.cityRef,

        // PERSON
        FirstName: isPerson ? d.firstName : undefined,
        LastName: isPerson ? d.lastName : undefined,
        MiddleName: isPerson ? d.middleName : undefined,
        Phone: isPerson ? this.normalizeNpPhone(String(d.phone ?? "")) : undefined,

        // COMPANY
        Description: !isPerson ? d.companyName : undefined,
        EDRPOU: !isPerson ? d.edrpou : undefined,
      });

      const cpData = (cp as { data?: Array<{ Ref?: unknown }> })?.data?.[0];
      refs.counterpartyRef = cpData?.Ref != null ? String(cpData.Ref) : undefined;
      if (!refs.counterpartyRef) {
        throw new BadRequestException("NP: Counterparty.save did not return Ref");
      }
    }

    // ContactPerson
    if (!refs.contactPersonRef) {
      const isPerson = d.recipientType === NpRecipientType.PERSON;

      const firstName = (isPerson ? d.firstName : d.contactPersonFirstName) as string | undefined;
      const lastName = (isPerson ? d.lastName : d.contactPersonLastName) as string | undefined;
      const middleName = (isPerson ? d.middleName : d.contactPersonMiddleName) as
        | string
        | undefined;
      const phone = (isPerson ? d.phone : d.contactPersonPhone) as string | undefined;

      if (!firstName || !lastName || !phone) {
        throw new BadRequestException(
          "Recipient contact fields required: firstName, lastName, phone",
        );
      }

      const cp = await this.np.call<Record<string, unknown>>("ContactPerson", "save", {
        CounterpartyRef: refs.counterpartyRef,
        FirstName: firstName,
        LastName: lastName,
        MiddleName: middleName || "",
        Phone: this.normalizeNpPhone(phone),
      });

      const cpDataContact = (cp as { data?: Array<{ Ref?: unknown }> })?.data?.[0];
      refs.contactPersonRef = cpDataContact?.Ref != null ? String(cpDataContact.Ref) : undefined;
      if (!refs.contactPersonRef) {
        throw new BadRequestException("NP: ContactPerson.save did not return Ref");
      }
    }

    // Address only for ADDRESS
    if (d.deliveryType === NpDeliveryType.ADDRESS && !refs.addressRef) {
      if (!d.streetRef || !d.building) {
        throw new BadRequestException("For ADDRESS delivery streetRef and building are required");
      }

      const adr = await this.np.call<Record<string, unknown>>("Address", "save", {
        CounterpartyRef: refs.counterpartyRef,
        StreetRef: d.streetRef,
        BuildingNumber: d.building,
        Flat: d.flat || "",
        Note: "CRM",
      });

      const adrData = (adr as { data?: Array<{ Ref?: unknown }> })?.data?.[0];
      refs.addressRef = adrData?.Ref != null ? String(adrData.Ref) : undefined;
      if (!refs.addressRef) {
        throw new BadRequestException("NP: Address.save did not return Ref");
      }
    }

    return refs;
  }

  // ==========================
  // InternetDocument.save body
  // ==========================
  private async resolveDeclaredCost(
    dto: CreateNpTtnDto,
    order: { totalAmount: unknown; currency: string | null },
  ): Promise<number> {
    if (dto.declaredCost != null && Number.isFinite(Number(dto.declaredCost))) {
      return Number(dto.declaredCost);
    }

    const mode = await this.settings.resolveNovaPoshtaDeclaredCostMode();
    if (mode === "order_total") {
      const total = Number(order.totalAmount ?? 0);
      if (Number.isFinite(total) && total > 0) {
        const rates = await this.settings.getExchangeRates();
        return orderAmountToUah(total, order.currency, rates);
      }
    }

    return 200;
  }

  private async buildInternetDocumentPayload(args: {
    dto: CreateNpTtnDto;
    resolved: { data: unknown };
    npRefs: Record<string, unknown>;
    orderNumber: string;
    documentRef?: string | null;
    documentNumber?: string | null;
  }) {
    const { dto, resolved, npRefs, orderNumber, documentRef, documentNumber } = args;
    const d = resolved.data as Record<string, unknown>;
    const sender = await this.getSenderRefsFromEnv();
    const isPerson = d.recipientType === NpRecipientType.PERSON;
    const recipientPhone = (isPerson ? d.phone : d.contactPersonPhone) as string | undefined;
    if (!recipientPhone?.trim()) throw new BadRequestException("Recipient phone is required");

    const parcels = Array.isArray(dto.parcels) ? dto.parcels : [];
    const seatsAmount = dto.seatsAmount ?? (parcels.length || 1);

    const totals = this.calcTotalsFromParcels(parcels);
    const defaultWeight = 0.5;
    const defaultDimensions = { width: 17, length: 12, height: 9 };
    const defaultVolume = (defaultDimensions.width * defaultDimensions.length * defaultDimensions.height) / 1_000_000;
    const weight = totals.weight > 0 ? totals.weight : defaultWeight;
    const volumeGeneral = totals.volume > 0 ? totals.volume : defaultVolume;

    const fin = await this.settings.resolveNovaPoshtaFinancialDefaults();
    const payerType = dto.payerType ?? fin.payerType;
    const paymentMethod = dto.paymentMethod ?? fin.paymentMethod;

    const isAddress = d.deliveryType === NpDeliveryType.ADDRESS;
    const recipientAddress = isAddress ? npRefs.addressRef : d.warehouseRef;

    if (!recipientAddress) {
      throw new BadRequestException(
        isAddress
          ? "ADDRESS: npAddressRef is missing (RecipientAddress not resolved)"
          : "WAREHOUSE/POSTOMAT: warehouseRef is required",
      );
    }

    let cityRecipient: string;
    let recipientAddressName: string | undefined;

    if (isAddress) {
      if (!d.cityRef) throw new BadRequestException("Recipient cityRef is required for ADDRESS");
      cityRecipient = String(d.cityRef);
      recipientAddressName =
        `${String(d.streetName ?? "")} ${String(d.building ?? "")}`.trim() || "Address";
    } else {
      if (!d.warehouseRef)
        throw new BadRequestException("WAREHOUSE/POSTOMAT: warehouseRef is required");

      const whRef = String(d.warehouseRef ?? "");
      const wh = await this.prisma.npWarehouse.findUnique({ where: { ref: whRef } });
      if (!wh) throw new BadRequestException("warehouseRef not found in cache (NpWarehouse)");

      // enrich for later persistence/profile save
      d.cityRef = wh.cityRef;
      const whExt = wh as Record<string, unknown>;
      d.warehouseNumber = String(whExt.number ?? "");
      d.warehouseType = whExt.isPostomat ? "POSTOMAT" : "WAREHOUSE";

      cityRecipient = wh.cityRef;
      recipientAddressName = String(whExt.shortAddress ?? wh.description ?? "");

      if (!d.cityName) {
        const city = await this.prisma.npCity.findUnique({ where: { ref: wh.cityRef } });
        d.cityName = city?.description ?? null;
      }
    }

    const serviceType = isAddress ? "WarehouseDoors" : "WarehouseWarehouse";
    // NP InternetDocument.save uses different payload shapes:
    // ADDRESS requires NewAddress + RecipientAddressName, but WAREHOUSE/POSTOMAT must be sent as SaveReq without them.
    return {
      ...(documentRef?.trim() ? { Ref: documentRef.trim() } : {}),
      ...(documentNumber?.trim() ? { IntDocNumber: documentNumber.trim() } : {}),
      ...(isAddress ? { NewAddress: "1" } : {}),

      PayerType: payerType,
      PaymentMethod: paymentMethod,

      CargoType: "Cargo",
      SeatsAmount: String(seatsAmount),
      Description: "мед. вироби",
      InfoRegClientBarcodes: orderNumber,
      Cost: String(dto.declaredCost ?? 200),

      Weight: String(weight),
      VolumeGeneral: String(volumeGeneral),

      ServiceType: serviceType,

      // Sender
      CitySender: sender.senderCityRef,
      Sender: sender.senderCounterpartyRef,
      SenderAddress: sender.senderWarehouseRef,
      ContactSender: sender.senderContactRef,
      SendersPhone: sender.senderPhone,

      // Recipient
      CityRecipient: cityRecipient,
      Recipient: String(npRefs.counterpartyRef ?? ""),
      ContactRecipient: String(npRefs.contactPersonRef ?? ""),
      RecipientsPhone: this.normalizeNpPhone(String(recipientPhone ?? "")),

      RecipientAddress: String(recipientAddress ?? ""),
      ...(isAddress ? { RecipientAddressName: recipientAddressName ?? "" } : {}),

      // NP API requires OptionsSeat; when frontend sends no parcels, send one default seat
      OptionsSeat:
        parcels.length > 0
          ? parcels.map((p: NpParcelDto, idx: number) => ({
              number: String(idx + 1),
              weight: String(p.weight),
              volumetricWidth: p.width != null ? String(p.width) : undefined,
              volumetricLength: p.length != null ? String(p.length) : undefined,
              volumetricHeight: p.height != null ? String(p.height) : undefined,
              volumetricVolume: this.calcVolume(p),
              cost: p.cost != null ? String(p.cost) : undefined,
            }))
          : [
              {
                number: "1",
                weight: String(weight),
                volumetricWidth: String(defaultDimensions.width),
                volumetricLength: String(defaultDimensions.length),
                volumetricHeight: String(defaultDimensions.height),
                volumetricVolume: String(defaultVolume),
              },
            ],
    };
  }

  private calcTotalsFromParcels(parcels: NpParcelDto[]) {
    let weight = 0;
    let volume = 0;
    for (const p of parcels) {
      const w = Number(p?.weight ?? 0);
      weight += Number.isFinite(w) ? w : 0;

      const v = Number(this.calcVolume(p));
      volume += Number.isFinite(v) ? v : 0;
    }
    return { weight, volume };
  }

  private calcVolume(p: NpParcelDto) {
    const w = Number(p?.width ?? 0);
    const l = Number(p?.length ?? 0);
    const h = Number(p?.height ?? 0);
    if (!w || !l || !h) return "0.00";
    return String((w * l * h) / 1_000_000);
  }

  // ======================
  // Save profile to contact
  // ======================
  private async upsertShippingProfile(
    contactId: string,
    dto: CreateNpTtnDto,
    resolved: { data: unknown },
    npRefs: Record<string, unknown>,
  ) {
    const d = resolved.data as Record<string, unknown>;

    const shouldSave = dto.saveAsProfile ?? true;
    if (!shouldSave) return;

    const label =
      dto.profileLabel ||
      d.label ||
      (d.deliveryType === NpDeliveryType.ADDRESS
        ? "Адрес"
        : d.deliveryType === NpDeliveryType.POSTOMAT
          ? "Поштомат"
          : "Отделение");

    const profileData: Omit<Prisma.ContactShippingProfileUncheckedCreateInput, "contactId"> = {
      label: String(label ?? ""),
      recipientType: d.recipientType as NpRecipientType,
      deliveryType: d.deliveryType as NpDeliveryType,

      firstName: d.firstName != null ? String(d.firstName) : null,
      lastName: d.lastName != null ? String(d.lastName) : null,
      middleName: d.middleName != null ? String(d.middleName) : null,
      phone: d.phone != null ? String(d.phone) : null,

      companyName: d.companyName != null ? String(d.companyName) : null,
      edrpou: d.edrpou != null ? String(d.edrpou) : null,
      contactPersonFirstName:
        d.contactPersonFirstName != null ? String(d.contactPersonFirstName) : null,
      contactPersonLastName:
        d.contactPersonLastName != null ? String(d.contactPersonLastName) : null,
      contactPersonMiddleName:
        d.contactPersonMiddleName != null ? String(d.contactPersonMiddleName) : null,
      contactPersonPhone: d.contactPersonPhone != null ? String(d.contactPersonPhone) : null,

      cityRef: d.cityRef != null ? String(d.cityRef) : null,
      cityName: d.cityName != null ? String(d.cityName) : null,

      warehouseRef: d.warehouseRef != null ? String(d.warehouseRef) : null,
      warehouseNumber: d.warehouseNumber != null ? String(d.warehouseNumber) : null,
      warehouseType: d.warehouseType != null ? String(d.warehouseType) : null,

      streetRef: d.streetRef != null ? String(d.streetRef) : null,
      streetName: d.streetName != null ? String(d.streetName) : null,
      building: d.building != null ? String(d.building) : null,
      flat: d.flat != null ? String(d.flat) : null,

      npCounterpartyRef: npRefs.counterpartyRef != null ? String(npRefs.counterpartyRef) : null,
      npContactPersonRef: npRefs.contactPersonRef != null ? String(npRefs.contactPersonRef) : null,
      npAddressRef: npRefs.addressRef != null ? String(npRefs.addressRef) : null,
    };

    const profileId = typeof dto.profileId === "string" ? dto.profileId.trim() : "";
    if (profileId) {
      await this.prisma.contactShippingProfile.update({
        where: { id: profileId },
        data: profileData,
      });
      return;
    }

    await this.prisma.contactShippingProfile.create({
      data: { contactId, ...profileData },
    });
  }

  // ======================
  // Persist TTN to Order.deliveryData (+ move NEW -> AWAITING_PAYMENT or AWAITING_STOCK)
  // ======================
  private async persistOrderDeliveryDataWithTtn(
    order: { id: string; status?: string | null; orderStage?: string | null; deliveryData?: unknown },
    resolved: { data: Record<string, unknown> },
    saved: {
      documentNumber: string;
      documentRef: string | null;
      cost: number | null;
      createdAt: Date;
    },
  ) {
    const d = resolved.data;

    // enrich for WAREHOUSE/POSTOMAT
    if (d.deliveryType !== NpDeliveryType.ADDRESS && d.warehouseRef) {
      const wh = await this.prisma.npWarehouse.findUnique({
        where: { ref: String(d.warehouseRef) },
      });
      if (wh) {
        d.cityRef = wh.cityRef;
        const whExt = wh as Record<string, unknown>;
        d.warehouseNumber = String(whExt.number ?? "");
        d.warehouseType = whExt.isPostomat ? "POSTOMAT" : "WAREHOUSE";
        if (!d.cityName) {
          const city = await this.prisma.npCity.findUnique({ where: { ref: wh.cityRef } });
          d.cityName = city?.description ?? null;
        }
      }
    }

    const prev = (order.deliveryData as Record<string, unknown>) ?? {};
    const prevNp = (prev?.novaPoshta ?? {}) as Record<string, unknown>;

    const nextDeliveryData = {
      ...prev,
      novaPoshta: {
        ...prevNp,

        recipientType: d.recipientType ?? null,
        deliveryType: d.deliveryType ?? null,

        cityRef: d.cityRef != null ? String(d.cityRef) : null,
        cityName: d.cityName != null ? String(d.cityName) : null,

        warehouseRef: d.warehouseRef != null ? String(d.warehouseRef) : null,
        warehouseNumber: d.warehouseNumber != null ? String(d.warehouseNumber) : null,
        warehouseType: d.warehouseType != null ? String(d.warehouseType) : null,

        streetRef: d.streetRef != null ? String(d.streetRef) : null,
        streetName: d.streetName != null ? String(d.streetName) : null,
        building: d.building != null ? String(d.building) : null,
        flat: d.flat != null ? String(d.flat) : null,

        ttn: {
          number: saved.documentNumber,
          ref: saved.documentRef,
          cost: saved.cost,
          createdAt: saved.createdAt,
        },
      },
    };

    const isNew =
      (order as { orderStage?: string | null }).orderStage === "NEW" ||
      order.status === "NEW";
    let statusUpdate: Record<string, unknown> = {};
    if (isNew) {
      const full = await this.prisma.order.findUnique({
        where: { id: order.id },
        select: {
          paymentType: true,
          paidAmount: true,
          totalAmount: true,
          debtAmount: true,
          paymentDueDate: true,
          orderStage: true,
        },
      });
      if (full) {
        const orderStage = orderStageAfterFirstTtnFromNew(full);
        statusUpdate = {
          orderStage,
          deliveryStatus: "NOT_SHIPPED" as const,
          financialStatus: computeFinancialStatusFromOrder({
            paymentType: full.paymentType,
            totalAmount: Number(full.totalAmount),
            paidAmount: Number(full.paidAmount),
            debtAmount: Number(full.debtAmount),
            paymentDueDate: full.paymentDueDate ?? undefined,
            orderStage,
          }),
        };
      }
    }
    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        deliveryData: nextDeliveryData as Prisma.InputJsonValue,
        ...statusUpdate,
      },
    });
  }

  // ======================
  // PUBLIC: clear TTN from order (delete in NP API, then OrderTtn + deliveryData)
  // ======================
  async clearTtnFromOrder(orderId: string) {
    if (process.env.NP_WRITES_DISABLED === "true") {
      throw new ServiceUnavailableException(
        "NP writes are disabled on this instance (use crm-module-np or unset NP_WRITES_DISABLED).",
      );
    }
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, deliveryData: true },
    });
    if (!order) throw new NotFoundException("Order not found");

    const ttns = await this.prisma.orderTtn.findMany({
      where: {
        carrier: "NOVA_POSHTA" as Carrier,
        OR: [{ orderId }, { shipment: { orderId } }],
      },
      select: { documentRef: true },
    });
    const refs = ttns.map((t) => t.documentRef).filter((r): r is string => r != null && r.trim() !== "");
    if (refs.length > 0) {
      try {
        await this.deleteNpInternetDocuments(refs);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new BadRequestException(`NP delete TTN failed: ${msg}`);
      }
    }

    await this.prisma.orderTtn.deleteMany({
      where: {
        OR: [{ orderId }, { shipment: { orderId } }],
      },
    });

    await this.prisma.shipment.updateMany({
      where: { orderId },
      data: { status: "CANCELED" },
    });

    const prev = (order.deliveryData as Record<string, unknown>) ?? {};
    const prevNp = (prev?.novaPoshta ?? {}) as Record<string, unknown>;
    const { ttn: _ttn, ...restNp } = prevNp;
    const nextDeliveryData = {
      ...prev,
      novaPoshta: Object.keys(restNp).length > 0 ? restNp : undefined,
    };
    if (!nextDeliveryData.novaPoshta) delete nextDeliveryData.novaPoshta;

    await this.prisma.order.update({
      where: { id: orderId },
      data: { deliveryData: nextDeliveryData as Prisma.InputJsonValue },
    });

    return { ok: true };
  }

  async clearTtnFromShipment(shipmentId: string) {
    if (process.env.NP_WRITES_DISABLED === "true") {
      throw new ServiceUnavailableException(
        "NP writes are disabled on this instance (use crm-module-np or unset NP_WRITES_DISABLED).",
      );
    }
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      select: { id: true, orderId: true },
    });
    if (!shipment) throw new NotFoundException("Shipment not found");

    const ttns = await this.prisma.orderTtn.findMany({
      where: { shipmentId, carrier: "NOVA_POSHTA" as Carrier },
      select: { documentRef: true, documentNumber: true },
    });
    const sharedNumbers = new Set<string>();
    for (const t of ttns) {
      const num = String(t.documentNumber ?? "").trim();
      if (!num) continue;
      const usage = await this.prisma.orderTtn.count({
        where: {
          carrier: "NOVA_POSHTA" as Carrier,
          documentNumber: num,
          shipmentId: { not: shipmentId },
        },
      });
      if (usage > 0) sharedNumbers.add(num);
    }
    if (sharedNumbers.size > 0) {
      throw new ConflictException(
        `TTN ${Array.from(sharedNumbers).join(", ")} прив'язана до інших замовлень. ` +
          "Використайте «Відв'язати від цього замовлення», щоб не скасовувати документ у НП.",
      );
    }
    const refs = ttns.map((t) => t.documentRef).filter((r): r is string => r != null && r.trim() !== "");
    if (refs.length > 0) {
      try {
        await this.deleteNpInternetDocuments(refs);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new BadRequestException(`NP delete TTN failed: ${msg}`);
      }
    }

    await this.prisma.orderTtn.deleteMany({ where: { shipmentId } });
    await this.prisma.shipment.update({
      where: { id: shipmentId },
      data: { status: "CANCELED" },
    });
    const orderShipments = await this.prisma.shipment.findMany({
      where: { orderId: shipment.orderId },
      select: {
        id: true,
        status: true,
        ttns: { take: 1, select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return { ok: true };
  }

  async unlinkTtnFromShipment(shipmentId: string) {
    if (process.env.NP_WRITES_DISABLED === "true") {
      throw new ServiceUnavailableException(
        "NP writes are disabled on this instance (use crm-module-np or unset NP_WRITES_DISABLED).",
      );
    }
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      select: { id: true },
    });
    if (!shipment) throw new NotFoundException("Shipment not found");

    await this.prisma.orderTtn.deleteMany({ where: { shipmentId } });
    await this.prisma.shipment.update({
      where: { id: shipmentId },
      data: { status: "CANCELED" },
    });
    return { ok: true, unlinkedOnly: true };
  }

  /** Nova Poshta expects `DocumentRefs` as an array of refs (not a comma-separated string). */
  private async deleteNpInternetDocuments(documentRefs: string[]) {
    const unique = [...new Set(documentRefs.map((r) => r.trim()).filter((r) => r.length > 0))];
    for (const ref of unique) {
      await this.np.call("InternetDocument", "delete", {
        DocumentRefs: [ref],
      });
    }
  }

  async reuseExistingTtnForOrder(
    orderId: string,
    input?: { sourceShipmentId?: string | null; sourceDocumentNumber?: string | null },
  ) {
    if (process.env.NP_WRITES_DISABLED === "true") {
      throw new ServiceUnavailableException(
        "NP writes are disabled on this instance (use crm-module-np or unset NP_WRITES_DISABLED).",
      );
    }
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { contact: true, client: true },
    });
    if (!order) throw new NotFoundException("Order not found");

    const sourceOr: Prisma.OrderTtnWhereInput[] = [];
    if (input?.sourceShipmentId) sourceOr.push({ shipmentId: input.sourceShipmentId });
    if (input?.sourceDocumentNumber) sourceOr.push({ documentNumber: input.sourceDocumentNumber });
    if (sourceOr.length === 0) {
      throw new BadRequestException("sourceShipmentId or sourceDocumentNumber is required");
    }
    const source = await this.prisma.orderTtn.findFirst({
      where: {
        carrier: "NOVA_POSHTA" as Carrier,
        OR: sourceOr,
      },
      orderBy: { createdAt: "desc" },
      include: {
        shipment: true,
      },
    });
    if (!source) throw new NotFoundException("Source TTN not found");

    const existingOnOrder = await this.prisma.orderTtn.findFirst({
      where: {
        carrier: "NOVA_POSHTA" as Carrier,
        OR: [{ orderId: order.id }, { shipment: { orderId: order.id } }],
      },
      select: { documentNumber: true },
    });
    if (existingOnOrder && existingOnOrder.documentNumber !== source.documentNumber) {
      throw new ConflictException(
        `У замовленні вже є ТТН №${existingOnOrder.documentNumber}. Для одного замовлення дозволена лише одна ТТН.`,
      );
    }

    const targetShipment = await this.ensureShipmentForOrder({
      order,
      recipientSnapshot:
        (source.shipment?.recipientSnapshot as Record<string, unknown> | undefined) ??
        undefined,
    });

    const existing = await this.prisma.orderTtn.findFirst({
      where: {
        shipmentId: targetShipment.id,
        documentNumber: source.documentNumber,
      },
      select: { id: true },
    });
    if (existing) {
      return { ok: true, reused: true, alreadyLinked: true, documentNumber: source.documentNumber };
    }

    const created = await this.prisma.orderTtn.create({
      data: {
        orderId: order.id,
        shipmentId: targetShipment.id,
        carrier: "NOVA_POSHTA" as Carrier,
        documentNumber: source.documentNumber,
        documentRef: source.documentRef,
        statusCode: source.statusCode,
        statusText: source.statusText,
        cost: source.cost,
        estimatedDeliveryDate: source.estimatedDeliveryDate,
        payloadSnapshot: {
          reusedFrom: {
            ttnId: source.id,
            shipmentId: source.shipmentId,
            orderId: source.shipment?.orderId ?? source.orderId ?? null,
          },
          sourceSnapshot: source.payloadSnapshot ?? null,
        } as Prisma.InputJsonValue,
      },
    });

    const snap = (source.shipment?.recipientSnapshot ?? {}) as Record<string, unknown>;
    await this.persistOrderDeliveryDataWithTtn(
      order,
      { data: snap },
      {
        documentNumber: created.documentNumber,
        documentRef: created.documentRef,
        cost: created.cost,
        createdAt: created.createdAt,
      },
    );
    return {
      ok: true,
      reused: true,
      alreadyLinked: false,
      documentNumber: created.documentNumber,
      sourceOrderId: source.shipment?.orderId ?? source.orderId ?? null,
    };
  }

  // ======================
  // PUBLIC: get TTN details for view/edit
  // ======================
  private isTtnEditable(statusCode: string | null | undefined): boolean {
    const code = statusCode != null ? String(statusCode).trim() : "";
    return !code || code === "1";
  }

  private async findTtnForOrder(
    orderId: string,
    opts?: { ttnId?: string; shipmentId?: string },
  ) {
    const where: Prisma.OrderTtnWhereInput = {
      carrier: "NOVA_POSHTA" as Carrier,
      OR: [{ orderId }, { shipment: { orderId } }],
    };
    if (opts?.ttnId?.trim()) where.id = opts.ttnId.trim();
    if (opts?.shipmentId?.trim()) where.shipmentId = opts.shipmentId.trim();

    const row = await this.prisma.orderTtn.findFirst({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        shipment: { select: { id: true, recipientSnapshot: true, orderId: true } },
      },
    });
    if (!row) throw new NotFoundException("TTN not found for this order");
    return row;
  }

  async getTtnDetailsByOrderId(
    orderId: string,
    opts?: { ttnId?: string; shipmentId?: string },
  ) {
    const row = await this.findTtnForOrder(orderId, opts);
    const snap = (row.shipment?.recipientSnapshot ?? {}) as Record<string, unknown>;
    const payloadSnap = (row.payloadSnapshot ?? {}) as Record<string, unknown>;
    const request = (payloadSnap.request ?? {}) as Record<string, unknown>;

    let recipient = snap;
    if (!recipient || Object.keys(recipient).length === 0) {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: { deliveryData: true },
      });
      const np = ((order?.deliveryData as Record<string, unknown> | null)?.novaPoshta ??
        {}) as Record<string, unknown>;
      recipient = np;
    }

    return {
      ok: true,
      ttn: {
        id: row.id,
        documentNumber: row.documentNumber,
        documentRef: row.documentRef,
        statusCode: row.statusCode,
        statusText: row.statusText,
        cost: row.cost,
        shipmentId: row.shipmentId,
        editable: this.isTtnEditable(row.statusCode),
        payerType:
          request.PayerType != null ? String(request.PayerType) : ("Recipient" as const),
        paymentMethod: request.PaymentMethod != null ? String(request.PaymentMethod) : null,
        recipient,
      },
    };
  }

  // ======================
  // PUBLIC: update TTN (NP InternetDocument.update)
  // ======================
  async updateTtnFromOrder(
    orderId: string,
    dto: CreateNpTtnDto,
    opts?: { ttnId?: string; shipmentId?: string },
  ) {
    if (process.env.NP_WRITES_DISABLED === "true") {
      throw new ServiceUnavailableException(
        "NP writes are disabled on this instance (use crm-module-np or unset NP_WRITES_DISABLED).",
      );
    }

    const existing = await this.findTtnForOrder(orderId, opts);
    if (!this.isTtnEditable(existing.statusCode)) {
      throw new BadRequestException(
        "ТТН уже в дорозі або доставлена — редагування недоступне. Скасуйте ТТН і створіть нову, якщо потрібно змінити дані.",
      );
    }
    if (!existing.documentRef?.trim()) {
      throw new BadRequestException(
        "У запису ТТН відсутній documentRef (посилання НП). Редагування неможливе.",
      );
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { contact: true, client: true },
    });
    if (!order) throw new BadRequestException("order not found");

    const contactId = order.contactId ?? order.clientId ?? null;
    if (!contactId) {
      throw new BadRequestException("order.contactId or order.clientId is required");
    }

    const resolved = await this.resolveRecipientData(contactId, dto);
    const resolvedData = resolved.data as Record<string, unknown>;
    const deliveryType = resolvedData.deliveryType as string | undefined;
    if (
      deliveryType === NpDeliveryType.WAREHOUSE ||
      deliveryType === NpDeliveryType.POSTOMAT
    ) {
      await this.tryResolveMissingNpRefsFromCache(resolvedData);
    }
    const cityRefVal = resolvedData.cityRef;
    const warehouseRefVal = resolvedData.warehouseRef;
    const missingRefs =
      (deliveryType === NpDeliveryType.WAREHOUSE || deliveryType === NpDeliveryType.POSTOMAT) &&
      (!cityRefVal || !warehouseRefVal);
    if (missingRefs) {
      throw new BadRequestException(
        "У профілі доставки відсутні CityRef або WarehouseRef. Оберіть адресу вручну.",
      );
    }
    if (deliveryType === NpDeliveryType.WAREHOUSE || deliveryType === NpDeliveryType.POSTOMAT) {
      await this.enrichWarehouseRecipientData(resolvedData);
    }

    const npRefs = await this.ensureNpRecipientRefs(resolved);
    const declaredCost = await this.resolveDeclaredCost(dto, order);
    const payload = await this.buildInternetDocumentPayload({
      dto: { ...dto, declaredCost },
      resolved,
      npRefs,
      orderNumber: order.orderNumber,
      documentRef: existing.documentRef,
      documentNumber: existing.documentNumber,
    });

    let doc: unknown;
    try {
      doc = await this.np.call<Record<string, unknown>>("InternetDocument", "update", payload);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new BadRequestException(`NP update error: ${msg}`);
    }

    const docObj = doc as { data?: Array<Record<string, unknown>>; errors?: string[] };
    const docData = docObj?.data?.[0];
    const cost =
      docData?.CostOnSite != null
        ? Number(docData.CostOnSite)
        : existing.cost != null
          ? Number(existing.cost)
          : null;

    await this.prisma.orderTtn.update({
      where: { id: existing.id },
      data: {
        cost,
        payloadSnapshot: {
          request: payload,
          response: doc,
          previous: existing.payloadSnapshot ?? null,
        } as Prisma.InputJsonValue,
      },
    });

    if (existing.shipmentId) {
      await this.prisma.shipment.update({
        where: { id: existing.shipmentId },
        data: {
          recipientSnapshot: resolved.data as Prisma.InputJsonValue,
        },
      });
    }

    await this.persistOrderDeliveryDataWithTtn(
      order,
      resolved as { data: Record<string, unknown> },
      {
        documentNumber: existing.documentNumber,
        documentRef: existing.documentRef,
        cost,
        createdAt: existing.createdAt,
      },
    );

    await this.upsertShippingProfile(
      contactId,
      dto,
      resolved as { data: Record<string, unknown> },
      npRefs,
    );

    return {
      ok: true,
      ttnId: existing.id,
      documentNumber: existing.documentNumber,
      documentRef: existing.documentRef,
      cost,
    };
  }

  // ======================
  // PUBLIC: get NP status by orderId (+ optional sync)
  // ======================
  async getTtnStatusByOrderId(orderId: string, opts?: { sync?: boolean }) {
    const last = await this.prisma.orderTtn.findFirst({
      where: {
        carrier: "NOVA_POSHTA" as Carrier,
        OR: [{ orderId }, { shipment: { orderId } }],
      },
      orderBy: { createdAt: "desc" },
    });

    if (!last?.documentNumber) throw new NotFoundException("TTN not found for this order");

    if (opts?.sync === false) {
      return {
        ok: true,
        fromCache: true,
        ttn: last.documentNumber,
        snapshot: last.payloadSnapshot ?? null,
      };
    }

    const mergedPhone = await this.settings.resolveNovaPoshtaSenderStrings();
    const phone = this.normalizeNpPhone(mergedPhone.senderPhone);
    if (!phone) {
      throw new BadRequestException(
        "Sender phone is required for status tracking (Settings → Nova Poshta or NP_SENDER_PHONE).",
      );
    }

    const payload = {
      Documents: [
        {
          DocumentNumber: last.documentNumber,
          Phone: phone.replace(/\D/g, ""),
        },
      ],
    };

    let resp: unknown;
    try {
      resp = await this.np.call<Record<string, unknown>>(
        "TrackingDocument",
        "getStatusDocuments",
        payload,
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new BadRequestException(`NP status error: ${msg}`);
    }

    const respObj = resp as { data?: unknown[]; errors?: string[] };
    const row = respObj?.data?.[0] as Record<string, unknown> | undefined;
    if (!row) {
      const errors = Array.isArray(respObj?.errors) ? respObj.errors.join("; ") : "";
      throw new BadRequestException(
        `NP status: empty response${errors ? `. Errors: ${errors}` : ""}`,
      );
    }

    // обновим TTN (status fields + snapshot)
    await this.prisma.orderTtn.update({
      where: { id: last.id },
      data: {
        statusCode: row?.StatusCode != null ? String(row.StatusCode) : null,
        statusText: row?.Status != null ? String(row.Status) : null,
        estimatedDeliveryDate: this.tryParseNpDateTime(row?.ScheduledDeliveryDate) ?? null,
        payloadSnapshot: {
          ...(last.payloadSnapshot as Record<string, unknown>),
          statusRequest: payload,
          statusResponse: resp,
        } as Prisma.InputJsonValue,
      },
    });

    if (last.shipmentId) {
      await this.prisma.shipment.update({
        where: { id: last.shipmentId },
        data: {
          status:
            String(row?.StatusCode ?? "") === "2"
              ? "CANCELED"
              : ["9", "10", "11"].includes(String(row?.StatusCode ?? ""))
                ? "DELIVERED"
                : "IN_TRANSIT",
        },
      });
    }

    // sync order.deliveryData + order.status
    await this.persistOrderNpStatus(orderId, row);

    return { ok: true, fromCache: false, ttn: last.documentNumber, status: row };
  }

  // ======================
  // PUBLIC: sync active TTNs (bulk)
  // ======================
  async syncActiveTtns(opts?: { limit?: number }) {
    const limit = Math.min(Math.max(Number(opts?.limit ?? 200), 1), 1000);

    // Phase 7: filter by orderStage only; exclude closed stages
    const closedStages: OrderStage[] = ["COMPLETED", "CANCELED", "REFUSED", "RETURN_IN_PROGRESS"];
    const orders = await this.prisma.order.findMany({
      where: {
        deliveryMethod: "NOVA_POSHTA" as Carrier,
        OR: [
          { orderStage: null },
          { orderStage: { notIn: closedStages } },
        ],
        AND: [
          {
            OR: [
              {
                deliveryData: {
                  path: ["novaPoshta", "ttn", "number"],
                  not: Prisma.JsonNull,
                },
              },
              { ttns: { some: {} } },
              { shipments: { some: { ttns: { some: {} } } } },
            ],
          },
        ],
      },
      orderBy: [
        { lastNpStatusSyncAt: { sort: "asc", nulls: "first" } },
        { id: "asc" },
      ],
      take: limit,
      select: {
        id: true,
        deliveryData: true,
        ttns: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { documentNumber: true },
        },
        shipments: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: {
            ttns: {
              take: 1,
              orderBy: { createdAt: "desc" },
              select: { documentNumber: true },
            },
          },
        },
      },
    });

    const docs = orders
      .map((o: {
        id: string;
        deliveryData: unknown;
        ttns?: { documentNumber: string }[];
        shipments?: { ttns?: { documentNumber: string }[] }[];
      }) => {
        const fromDeliveryData = (
          ((o.deliveryData as Record<string, unknown>)?.novaPoshta as Record<string, unknown>)
            ?.ttn as Record<string, unknown>
        )?.number as string | undefined;
        const fromTtns = o.ttns?.[0]?.documentNumber;
        const fromShipment = o.shipments?.[0]?.ttns?.[0]?.documentNumber;
        const ttn = fromDeliveryData ?? fromShipment ?? fromTtns ?? undefined;
        return ttn ? { orderId: o.id, ttn } : null;
      })
      .filter((x): x is { orderId: string; ttn: string } => !!x);

    // chunk by 100 (лимит НП)
    const chunks: Array<Array<{ orderId: string; ttn: string }>> = [];
    let cur: Array<{ orderId: string; ttn: string }> = [];
    for (const d of docs) {
      cur.push(d);
      if (cur.length >= 100) {
        chunks.push(cur);
        cur = [];
      }
    }
    if (cur.length) chunks.push(cur);

    let checked = 0;
    let updatedOrders = 0;
    let skipped = 0;

    for (const chunk of chunks) {
      checked += chunk.length;

      const resp = await this.np.call<Record<string, unknown>>(
        "TrackingDocument",
        "getStatusDocuments",
        {
          Documents: chunk.map((x) => ({ DocumentNumber: x.ttn })),
        },
      );

      const arr = Array.isArray(resp?.data) ? resp.data : [];
      const byNumber = new Map<string, Record<string, unknown>>();
      for (const s of arr) if (s?.Number) byNumber.set(String(s.Number), s);

      for (const item of chunk) {
        const status = byNumber.get(item.ttn);
        if (!status) {
          skipped++;
          continue;
        }
        const updated = await this.persistOrderNpStatus(item.orderId, status);
        if (updated) updatedOrders++;
      }

      const syncedAt = new Date();
      await this.prisma.order.updateMany({
        where: { id: { in: chunk.map((c) => c.orderId) } },
        data: { lastNpStatusSyncAt: syncedAt },
      });
    }

    return { ok: true, checked, updatedOrders, skipped };
  }

  // ======================
  // PRIVATE: map NP -> OrderStatus (Variant A + SUCCESS rule)
  // ======================
  private mapNpToOrderStatus(args: {
    npCode?: string | number;
    npText?: string;
    debtAmount?: number | null;
  }): OrderStatus | null {
    const code = String(args.npCode ?? "").trim();
    const text = String(args.npText ?? "").toLowerCase();
    const debt = Number(args.debtAmount ?? 0);

    // 1) отмена/удаление
    if (code === "2" || text.includes("видал") || text.includes("удален")) return "CANCELED";

    // 2) возврат/отказ/не вручено — по тексту надежнее всего
    if (
      text.includes("повернен") ||
      text.includes("повернення") ||
      text.includes("возврат") ||
      text.includes("відмова") ||
      text.includes("отказ") ||
      text.includes("не вруч") ||
      text.includes("не вручен")
    ) {
      return "RETURNING";
    }

    // 3) получено (часто 9/10/11)
    if (["9", "10", "11"].includes(code) || text.includes("отрим") || text.includes("получено")) {
      return debt <= 0.00001 ? "SUCCESS" : "CONTROL_PAYMENT";
    }

    // 4) в пути / принято / прибыло / перемещение
    if (
      ["3", "4", "41", "5", "6", "7", "8", "101"].includes(code) ||
      text.includes("в дороз") ||
      text.includes("в пути") ||
      text.includes("прямує") ||
      text.includes("прибул") ||
      text.includes("прийнят") ||
      text.includes("принят")
    ) {
      return "SHIPPED";
    }

    // 5) создана, но не передана
    if (code === "1" || text.includes("створив") || text.includes("создан")) return "IN_WORK";

    return null;
  }

  private shouldAdvanceOrderStatus(current: OrderStatus, next: OrderStatus) {
    // terminal guards
    if (current === "CANCELED") return false;
    if (current === "SUCCESS" && next !== "SUCCESS") return false;

    // RETURNING/CANCELED перебивают почти всегда (кроме SUCCESS выше)
    if (next === "CANCELED") return true;
    if (next === "RETURNING") return true;

    const rank: Record<OrderStatus, number> = {
      NEW: 10,
      IN_WORK: 20,
      READY_TO_SHIP: 30,
      SHIPPED: 40,
      CONTROL_PAYMENT: 50,
      SUCCESS: 60,
      RETURNING: 70,
      CANCELED: 80,
    };

    return (rank[next] ?? 0) > (rank[current] ?? 0);
  }

  // ======================
  // PRIVATE: persist NP tracking status & map to order.status
  // ======================
  private async persistOrderNpStatus(orderId: string, status: Record<string, unknown>) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        orderStage: true,
        debtAmount: true,
        paymentType: true,
        paidAmount: true,
        totalAmount: true,
        paymentDueDate: true,
        deliveryMethod: true,
        deliveryData: true,
        ttns: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { id: true },
        },
      },
    });
    if (!order) return false;

    // Самовывоз: НП не трогаем (и не делаем auto SUCCESS тут)
    if (order.deliveryMethod === "PICKUP") return true;

    const prev = (order.deliveryData as Record<string, unknown>) ?? {};
    const prevNp = prev?.novaPoshta ?? {};

    const nextDeliveryData = {
      ...prev,
      novaPoshta: {
        ...prevNp,
        status: status ?? null,
      },
    };

    // Phase 7: when status is null, derive current from orderStage so we don't overwrite COMPLETED with older NP status
    const currentStatus = (order.status ? String(order.status) : orderStageToLegacyStatus(order.orderStage ?? "NEW", { debtAmount: order.debtAmount })) as OrderStatus;
    const mappedLegacy = this.mapNpToOrderStatus({
      npCode: status?.StatusCode != null ? String(status.StatusCode) : undefined,
      npText: status?.Status != null ? String(status.Status) : undefined,
      debtAmount: order.debtAmount,
    });

    const updateData: Prisma.OrderUpdateInput = {
      deliveryData: nextDeliveryData as Prisma.InputJsonValue,
      lastNpStatusSyncAt: new Date(),
    };

    if (
      mappedLegacy &&
      mappedLegacy !== currentStatus &&
      this.shouldAdvanceOrderStatus(currentStatus, mappedLegacy)
    ) {
      const newFields = legacyStatusToOrderUpdate(mappedLegacy as PrismaOrderStatus, {
        paymentType: order.paymentType,
        paidAmount: order.paidAmount,
        totalAmount: order.totalAmount,
        debtAmount: order.debtAmount,
        paymentDueDate: order.paymentDueDate,
      });
      updateData.orderStage = newFields.orderStage;
      updateData.deliveryStatus = newFields.deliveryStatus;
      updateData.financialStatus = newFields.financialStatus;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: updateData,
      });

      // Обновим последнюю TTN полями статуса (если есть)
      const lastTtnId = order.ttns?.[0]?.id;
      if (lastTtnId) {
        await tx.orderTtn.update({
          where: { id: lastTtnId },
          data: {
            statusCode: status?.StatusCode != null ? String(status.StatusCode) : null,
            statusText: status?.Status != null ? String(status.Status) : null,
            estimatedDeliveryDate:
              this.tryParseNpDateTime(status?.ScheduledDeliveryDate as unknown) ?? null,
            // updatedAt в Prisma @updatedAt обновится сам на update
          },
        });
      }
    });

    return true;
  }

  private tryParseNpDateTime(v: unknown): Date | null {
    // NP часто возвращает "12-02-2026 09:00:00" (локальний час UA)
    const s = String(v ?? "").trim();
    if (!s) return null;

    const m = s.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return null;

    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);
    const hh = Number(m[4]);
    const mi = Number(m[5]);
    const ss = Number(m[6] ?? "0");

    const dt = kyivWallToUtc(yyyy, mm, dd, hh, mi, ss);
    return Number.isFinite(dt.getTime()) ? dt : null;
  }
}
