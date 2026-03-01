// src/np/np-ttn.service.ts

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { NpClient } from "./np-client.service";
import type { CreateNpTtnDto, NpParcelDto } from "./dto/create-np-ttn.dto";
import { NpDeliveryType, NpRecipientType } from "./dto/create-np-ttn.dto";
import { Prisma } from "@prisma/client";
import type { Carrier, OrderStatus as PrismaOrderStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

type SenderCache = {
  senderCityRef: string;
  senderWarehouseRef: string;
  senderCounterpartyRef: string;
  senderContactRef: string;
  senderPhone: string;
  senderAddressName?: string; // только для debug, в payload не отправляем
};

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
  private senderCache: SenderCache | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly np: NpClient,
  ) {}

  // ======================
  // PUBLIC: create TTN
  // ======================
  async createFromOrder(orderId: string, dto: CreateNpTtnDto) {
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

    const resolved = await this.resolveRecipientData(contactId, dto);

    // 1) ensure NP entities (Recipient counterparty/contact/address)
    const npRefs = await this.ensureNpRecipientRefs(resolved);

    // 2) build payload
    const payload = await this.buildInternetDocumentPayload({
      dto,
      resolved,
      npRefs,
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

    // 4) save TTN record
    const saved = await this.prisma.orderTtn.create({
      data: {
        orderId: order.id,
        carrier: "NOVA_POSHTA" as Carrier,
        documentNumber: String(docData.IntDocNumber ?? ""),
        documentRef: docData.Ref != null ? String(docData.Ref) : null,
        cost: docData.CostOnSite != null ? Number(docData.CostOnSite) : null,
        payloadSnapshot: { request: payload, response: doc } as Prisma.InputJsonValue,
      },
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
    if (dto.profileId) {
      const profile = await this.prisma.contactShippingProfile.findUnique({
        where: { id: dto.profileId },
      });
      if (!profile || profile.contactId !== contactId)
        throw new BadRequestException("profile not found");

      return {
        sourceProfile: profile,
        data: { ...profile, ...(dto.draft ?? {}) },
      };
    }

    if (!dto.draft) throw new BadRequestException("draft is required if profileId not provided");
    return { sourceProfile: null, data: dto.draft };
  }

  // =====================================
  // Sender: ONLY from ENV refs + validation
  // =====================================
  private async getSenderRefsFromEnv(): Promise<SenderCache> {
    if (this.senderCache) return this.senderCache;

    const senderCityRef = (process.env.NP_SENDER_CITY_REF ?? "").trim();
    const senderWarehouseRef = (process.env.NP_SENDER_WAREHOUSE_REF ?? "").trim();
    const senderCounterpartyRef = (process.env.NP_SENDER_COUNTERPARTY_REF ?? "").trim();
    const senderContactRef = (process.env.NP_SENDER_CONTACT_REF ?? "").trim();
    const senderPhoneEnv = (process.env.NP_SENDER_PHONE ?? "").trim();

    if (!senderCityRef) throw new BadRequestException("Set NP_SENDER_CITY_REF in .env");
    if (!senderWarehouseRef) throw new BadRequestException("Set NP_SENDER_WAREHOUSE_REF in .env");
    if (!senderCounterpartyRef)
      throw new BadRequestException("Set NP_SENDER_COUNTERPARTY_REF in .env");
    if (!senderContactRef) throw new BadRequestException("Set NP_SENDER_CONTACT_REF in .env");
    if (!senderPhoneEnv) throw new BadRequestException("Set NP_SENDER_PHONE in .env");

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
        `Sender warehouseRef city mismatch: wh.cityRef=${wh.cityRef} vs NP_SENDER_CITY_REF=${senderCityRef}`,
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

    this.senderCache = cache;
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
  private async buildInternetDocumentPayload(args: {
    dto: CreateNpTtnDto;
    resolved: { data: unknown };
    npRefs: Record<string, unknown>;
  }) {
    const { dto, resolved, npRefs } = args;
    const d = resolved.data as Record<string, unknown>;

    const sender = await this.getSenderRefsFromEnv();
    if (!d.phone) throw new BadRequestException("Recipient phone is required");

    const parcels = Array.isArray(dto.parcels) ? dto.parcels : [];
    const seatsAmount = dto.seatsAmount ?? (parcels.length || 1);

    const totals = this.calcTotalsFromParcels(parcels);
    const weight = totals.weight > 0 ? totals.weight : 1;
    const volumeGeneral = totals.volume > 0 ? totals.volume : 0.001;

    const payerType = dto.payerType ?? (process.env.NP_DEFAULT_PAYER_TYPE || "Recipient");
    const paymentMethod = dto.paymentMethod ?? (process.env.NP_DEFAULT_PAYMENT_METHOD || "Cash");

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

    return {
      NewAddress: "1",

      PayerType: payerType,
      PaymentMethod: paymentMethod,

      CargoType: "Cargo",
      SeatsAmount: String(seatsAmount),
      Description: dto.description || "Goods",
      Cost: String(dto.declaredCost ?? 0),

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
      RecipientsPhone: this.normalizeNpPhone(String(d.phone ?? "")),

      RecipientAddress: String(recipientAddress ?? ""),
      RecipientAddressName: recipientAddressName ?? "",

      ...(parcels.length
        ? {
            OptionsSeat: parcels.map((p: NpParcelDto, idx: number) => ({
              number: String(idx + 1),
              weight: String(p.weight),
              volumetricWidth: p.width != null ? String(p.width) : undefined,
              volumetricLength: p.length != null ? String(p.length) : undefined,
              volumetricHeight: p.height != null ? String(p.height) : undefined,
              volumetricVolume: this.calcVolume(p),
              cost: p.cost != null ? String(p.cost) : undefined,
            })),
          }
        : {}),
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

    if (dto.profileId) {
      await this.prisma.contactShippingProfile.update({
        where: { id: dto.profileId },
        data: profileData,
      });
      return;
    }

    await this.prisma.contactShippingProfile.create({
      data: { contactId, ...profileData },
    });
  }

  // ======================
  // Persist TTN to Order.deliveryData (+ move NEW -> IN_WORK)
  // ======================
  private async persistOrderDeliveryDataWithTtn(
    order: { id: string; status: string; deliveryData?: unknown },
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

    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        deliveryData: nextDeliveryData as Prisma.InputJsonValue,
        ...(order.status === "NEW" ? { status: "IN_WORK" } : {}),
      },
    });
  }

  // ======================
  // PUBLIC: clear TTN from order (delete OrderTtn, clear deliveryData.novaPoshta.ttn)
  // ======================
  async clearTtnFromOrder(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, deliveryData: true },
    });
    if (!order) throw new NotFoundException("Order not found");

    await this.prisma.orderTtn.deleteMany({
      where: { orderId },
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

  // ======================
  // PUBLIC: get NP status by orderId (+ optional sync)
  // ======================
  async getTtnStatusByOrderId(orderId: string, opts?: { sync?: boolean }) {
    const last = await this.prisma.orderTtn.findFirst({
      where: { orderId, carrier: "NOVA_POSHTA" as Carrier },
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

    const phone = (process.env.NP_SENDER_PHONE ?? "").trim();
    if (!phone) throw new BadRequestException("NP_SENDER_PHONE is required for status tracking");

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

    // sync order.deliveryData + order.status
    await this.persistOrderNpStatus(orderId, row);

    return { ok: true, fromCache: false, ttn: last.documentNumber, status: row };
  }

  // ======================
  // PUBLIC: sync active TTNs (bulk)
  // ======================
  async syncActiveTtns(opts?: { limit?: number }) {
    const limit = Math.min(Math.max(Number(opts?.limit ?? 200), 1), 1000);

    // Берем заказы с ТТН, которые еще не финальные
    const orders = await this.prisma.order.findMany({
      where: {
        deliveryMethod: "NOVA_POSHTA" as Carrier,
        status: { notIn: ["SUCCESS", "CANCELED", "RETURNING"] as PrismaOrderStatus[] },
        deliveryData: {
          path: ["novaPoshta", "ttn", "number"],
          not: Prisma.JsonNull,
        },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: { id: true, deliveryData: true },
    });

    const docs = orders
      .map((o) => ({
        orderId: o.id,
        ttn: (
          ((o.deliveryData as Record<string, unknown>)?.novaPoshta as Record<string, unknown>)
            ?.ttn as Record<string, unknown>
        )?.number as string | undefined,
      }))
      .filter((x) => !!x.ttn) as Array<{ orderId: string; ttn: string }>;

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
        debtAmount: true,
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

    const currentStatus = String(order.status) as OrderStatus;
    const mapped = this.mapNpToOrderStatus({
      npCode: status?.StatusCode != null ? String(status.StatusCode) : undefined,
      npText: status?.Status != null ? String(status.Status) : undefined,
      debtAmount: order.debtAmount,
    });

    const updateData: Prisma.OrderUpdateInput = {
      deliveryData: nextDeliveryData as Prisma.InputJsonValue,
    };

    if (
      mapped &&
      mapped !== currentStatus &&
      this.shouldAdvanceOrderStatus(currentStatus, mapped)
    ) {
      updateData.status = mapped as PrismaOrderStatus;
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
    // NP часто возвращает "12-02-2026 09:00:00"
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

    const dt = new Date(yyyy, mm - 1, dd, hh, mi, ss);
    return Number.isFinite(dt.getTime()) ? dt : null;
  }
}
