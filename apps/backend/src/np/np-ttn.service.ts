// src/np/np-ttn.service.ts

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NpClient } from "./np-client.service";
import {
  CreateNpTtnDto,
  NpDeliveryType,
  NpRecipientType,
} from "./dto/create-np-ttn.dto";

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
  | "PAYMENT_CONTROL"
  | "CONTROL_PAYMENT"
  | "SUCCESS"
  | "RETURNING"
  | "CANCELED";

type ShipmentOrderItem = {
  id: string;
  qty: number;
  qtyShipped: number;
};

type ShipmentPlanLine = {
  orderItemId: string;
  qtyShipped: number;
};

@Injectable()
export class NpTtnService {
  private readonly logger = new Logger(NpTtnService.name);
  private senderCache: SenderCache | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly np: NpClient,
  ) { }


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
  
    const orderItems = await this.prisma.orderItem.findMany({
      where: { orderId: order.id },
      select: {
        id: true,
        qty: true,
        qtyShipped: true,
      },
    });

    // Validate before NP API call so we don't create remote TTN for invalid shipment.
    const precheckShipmentPlan = this.buildShipmentPlan(orderItems, dto.shippedItems);

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
    let doc: any;
    try {
      doc = await this.np.call<any>("InternetDocument", "save", payload);
    } catch (e: any) {
      throw new BadRequestException(`NP error: ${e?.message || e}`);
    }

    const docData = doc?.data?.[0];
    if (!docData?.IntDocNumber) {
      const errors = Array.isArray(doc?.errors) ? doc.errors.join("; ") : "";
      throw new BadRequestException(
        `NP: no IntDocNumber in response${errors ? `. Errors: ${errors}` : ""}`,
      );
    }

    // 4) save TTN + shipment rows atomically
    const { saved, shipmentPlan } = await this.prisma.$transaction(async (tx) => {
      const lockedOrderItems = await tx.$queryRaw<ShipmentOrderItem[]>`
        SELECT "id", "qty", "qtyShipped"
        FROM "OrderItem"
        WHERE "orderId" = ${order.id}
        FOR UPDATE
      `;

      const safeShipmentPlan = this.buildShipmentPlan(
        lockedOrderItems,
        dto.shippedItems ?? precheckShipmentPlan,
      );

      const createdTtn = await tx.orderTtn.create({
        data: {
          orderId: order.id,
          carrier: "NOVA_POSHTA" as any,
          documentNumber: docData.IntDocNumber,
          documentRef: docData.Ref || null,
          cost: docData.CostOnSite ? Number(docData.CostOnSite) : null,
          payloadSnapshot: {
            request: payload,
            response: doc,
            shippedItems: safeShipmentPlan,
          },
        },
      });

      await tx.orderTtnItem.createMany({
        data: safeShipmentPlan.map((line) => ({
          ttnId: createdTtn.id,
          orderItemId: line.orderItemId,
          qtyShipped: line.qtyShipped,
        })),
      });

      for (const line of safeShipmentPlan) {
        await tx.orderItem.update({
          where: { id: line.orderItemId },
          data: {
            qtyShipped: {
              increment: line.qtyShipped,
            },
          },
        });
      }

      return { saved: createdTtn, shipmentPlan: safeShipmentPlan };
    });

    // 4.5) persist TTN into Order.deliveryData (+ move NEW -> IN_WORK)
    await this.persistOrderDeliveryDataWithTtn(order, resolved, saved);

    // 5) persist profile updates (including NP refs)
    await this.upsertShippingProfile(contactId, dto, resolved, npRefs);

    return {
      ttnId: saved.id,
      documentNumber: saved.documentNumber,
      documentRef: saved.documentRef,
      cost: saved.cost,
      shippedItems: shipmentPlan,
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

    if (!dto.draft)
      throw new BadRequestException(
        "draft is required if profileId not provided",
      );
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
    if (!senderCounterpartyRef) throw new BadRequestException("Set NP_SENDER_COUNTERPARTY_REF in .env");
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
    if ((wh as any).isPostomat) {
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
      senderAddressName: (wh as any).shortAddress ?? wh.description,
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
  private async ensureNpRecipientRefs(resolved: any) {
    const d = resolved.data;

    const refs = {
      counterpartyRef: d.npCounterpartyRef as string | undefined,
      contactPersonRef: d.npContactPersonRef as string | undefined,
      addressRef: d.npAddressRef as string | undefined, // only for ADDRESS
    };

    // Counterparty (Recipient)
    if (!refs.counterpartyRef) {
      const isPerson = d.recipientType === NpRecipientType.PERSON;
      if (!d.cityRef) throw new BadRequestException("Recipient cityRef is required");

      const cp = await this.np.call<any>("Counterparty", "save", {
        CounterpartyProperty: "Recipient",
        CounterpartyType: isPerson ? "PrivatePerson" : "Organization",
        CityRef: d.cityRef,

        // PERSON
        FirstName: isPerson ? d.firstName : undefined,
        LastName: isPerson ? d.lastName : undefined,
        MiddleName: isPerson ? d.middleName : undefined,
        Phone: isPerson ? this.normalizeNpPhone(d.phone) : undefined,

        // COMPANY
        Description: !isPerson ? d.companyName : undefined,
        EDRPOU: !isPerson ? d.edrpou : undefined,
      });

      refs.counterpartyRef = cp?.data?.[0]?.Ref;
      if (!refs.counterpartyRef) {
        throw new BadRequestException("NP: Counterparty.save did not return Ref");
      }
    }

    // ContactPerson
    if (!refs.contactPersonRef) {
      const isPerson = d.recipientType === NpRecipientType.PERSON;

      const firstName = isPerson ? d.firstName : d.contactPersonFirstName;
      const lastName = isPerson ? d.lastName : d.contactPersonLastName;
      const middleName = isPerson ? d.middleName : d.contactPersonMiddleName;
      const phone = isPerson ? d.phone : d.contactPersonPhone;

      if (!firstName || !lastName || !phone) {
        throw new BadRequestException(
          "Recipient contact fields required: firstName, lastName, phone",
        );
      }

      const cp = await this.np.call<any>("ContactPerson", "save", {
        CounterpartyRef: refs.counterpartyRef,
        FirstName: firstName,
        LastName: lastName,
        MiddleName: middleName || "",
        Phone: this.normalizeNpPhone(phone),
      });

      refs.contactPersonRef = cp?.data?.[0]?.Ref;
      if (!refs.contactPersonRef) {
        throw new BadRequestException("NP: ContactPerson.save did not return Ref");
      }
    }

    // Address only for ADDRESS
    if (d.deliveryType === NpDeliveryType.ADDRESS && !refs.addressRef) {
      if (!d.streetRef || !d.building) {
        throw new BadRequestException(
          "For ADDRESS delivery streetRef and building are required",
        );
      }

      const adr = await this.np.call<any>("Address", "save", {
        CounterpartyRef: refs.counterpartyRef,
        StreetRef: d.streetRef,
        BuildingNumber: d.building,
        Flat: d.flat || "",
        Note: "CRM",
      });

      refs.addressRef = adr?.data?.[0]?.Ref;
      if (!refs.addressRef) {
        throw new BadRequestException("NP: Address.save did not return Ref");
      }
    }

    return refs;
  }

  // ==========================
  // InternetDocument.save body
  // ==========================
  private async buildInternetDocumentPayload(args: any) {
    const { dto, resolved, npRefs } = args;
    const d = resolved.data;

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
      cityRecipient = d.cityRef;
      recipientAddressName =
        `${d.streetName ?? ""} ${d.building ?? ""}`.trim() || "Address";
    } else {
      if (!d.warehouseRef)
        throw new BadRequestException("WAREHOUSE/POSTOMAT: warehouseRef is required");

      const wh = await this.prisma.npWarehouse.findUnique({ where: { ref: d.warehouseRef } });
      if (!wh) throw new BadRequestException("warehouseRef not found in cache (NpWarehouse)");

      // enrich for later persistence/profile save
      d.cityRef = wh.cityRef;
      d.warehouseNumber = String((wh as any).number ?? "");
      d.warehouseType = (wh as any).isPostomat ? "POSTOMAT" : "WAREHOUSE";

      cityRecipient = wh.cityRef;
      recipientAddressName = (wh as any).shortAddress ?? wh.description;

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
      Recipient: npRefs.counterpartyRef,
      ContactRecipient: npRefs.contactPersonRef,
      RecipientsPhone: this.normalizeNpPhone(d.phone),

      RecipientAddress: recipientAddress,
      RecipientAddressName: recipientAddressName,

      ...(parcels.length
        ? {
          OptionsSeat: parcels.map((p: any, idx: number) => ({
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

  private calcTotalsFromParcels(parcels: any[]) {
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

  private calcVolume(p: any) {
    const w = Number(p?.width ?? 0);
    const l = Number(p?.length ?? 0);
    const h = Number(p?.height ?? 0);
    if (!w || !l || !h) return "0.00";
    return String((w * l * h) / 1_000_000);
  }

  private buildShipmentPlan(
    orderItems: ShipmentOrderItem[],
    requested: Array<{ orderItemId: string; qtyShipped: number }> | undefined,
  ): ShipmentPlanLine[] {
    if (!orderItems.length) {
      throw new BadRequestException("Order has no items to ship");
    }

    const byId = new Map(orderItems.map((item) => [item.id, item]));
    const normalizedRequested = this.normalizeRequestedShipmentItems(requested);

    const shipmentPlan =
      normalizedRequested.length > 0
        ? normalizedRequested
        : orderItems
            .map((item) => ({
              orderItemId: item.id,
              qtyShipped: Math.max(item.qty - item.qtyShipped, 0),
            }))
            .filter((item) => item.qtyShipped > 0);

    if (!shipmentPlan.length) {
      throw new BadRequestException("Nothing left to ship for this order");
    }

    for (const line of shipmentPlan) {
      const orderItem = byId.get(line.orderItemId);
      if (!orderItem) {
        throw new BadRequestException(`Order item ${line.orderItemId} is not part of this order`);
      }

      const remainingQty = Math.max(orderItem.qty - orderItem.qtyShipped, 0);
      if (line.qtyShipped > remainingQty) {
        throw new BadRequestException(
          `qtyShipped for item ${line.orderItemId} exceeds remaining (${remainingQty})`,
        );
      }
    }

    return shipmentPlan;
  }

  private normalizeRequestedShipmentItems(
    requested: Array<{ orderItemId: string; qtyShipped: number }> | undefined,
  ): ShipmentPlanLine[] {
    if (requested == null) return [];
    if (!Array.isArray(requested)) {
      throw new BadRequestException("shippedItems must be an array");
    }

    const merged = new Map<string, number>();
    for (const raw of requested) {
      const orderItemId = String(raw?.orderItemId ?? "").trim();
      const qtyShipped = Number(raw?.qtyShipped);

      if (!orderItemId) {
        throw new BadRequestException("orderItemId is required in shippedItems");
      }
      if (!Number.isInteger(qtyShipped) || qtyShipped < 1) {
        throw new BadRequestException(
          `qtyShipped must be a positive integer for item ${orderItemId}`,
        );
      }

      merged.set(orderItemId, (merged.get(orderItemId) ?? 0) + qtyShipped);
    }

    return Array.from(merged.entries()).map(([orderItemId, qtyShipped]) => ({
      orderItemId,
      qtyShipped,
    }));
  }

  // ======================
  // Save profile to contact
  // ======================
  private async upsertShippingProfile(
    contactId: string,
    dto: CreateNpTtnDto,
    resolved: any,
    npRefs: any,
  ) {
    const d = resolved.data;

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

    const profileData = {
      label,
      recipientType: d.recipientType as NpRecipientType,
      deliveryType: d.deliveryType as NpDeliveryType,

      firstName: d.firstName ?? null,
      lastName: d.lastName ?? null,
      middleName: d.middleName ?? null,
      phone: d.phone ?? null,

      companyName: d.companyName ?? null,
      edrpou: d.edrpou ?? null,
      contactPersonFirstName: d.contactPersonFirstName ?? null,
      contactPersonLastName: d.contactPersonLastName ?? null,
      contactPersonMiddleName: d.contactPersonMiddleName ?? null,
      contactPersonPhone: d.contactPersonPhone ?? null,

      cityRef: d.cityRef ?? null,
      cityName: d.cityName ?? null,

      warehouseRef: d.warehouseRef ?? null,
      warehouseNumber: d.warehouseNumber ?? null,
      warehouseType: d.warehouseType ?? null,

      streetRef: d.streetRef ?? null,
      streetName: d.streetName ?? null,
      building: d.building ?? null,
      flat: d.flat ?? null,

      npCounterpartyRef: npRefs.counterpartyRef ?? null,
      npContactPersonRef: npRefs.contactPersonRef ?? null,
      npAddressRef: npRefs.addressRef ?? null,
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
  private async persistOrderDeliveryDataWithTtn(order: any, resolved: any, saved: any) {
    const d = resolved.data;

    // enrich for WAREHOUSE/POSTOMAT
    if (d.deliveryType !== NpDeliveryType.ADDRESS && d.warehouseRef) {
      const wh = await this.prisma.npWarehouse.findUnique({ where: { ref: d.warehouseRef } });
      if (wh) {
        d.cityRef = wh.cityRef;
        d.warehouseNumber = String((wh as any).number ?? "");
        d.warehouseType = (wh as any).isPostomat ? "POSTOMAT" : "WAREHOUSE";
        if (!d.cityName) {
          const city = await this.prisma.npCity.findUnique({ where: { ref: wh.cityRef } });
          d.cityName = city?.description ?? null;
        }
      }
    }

    const prev = (order as any).deliveryData ?? {};
    const prevNp = prev?.novaPoshta ?? {};

    const previousTtnList = Array.isArray(prevNp?.ttns) ? [...prevNp.ttns] : [];
    const legacySingleTtn = prevNp?.ttn;
    const hasLegacyInList =
      legacySingleTtn?.number &&
      previousTtnList.some((ttn: any) => ttn?.number === legacySingleTtn.number);

    if (legacySingleTtn?.number && !hasLegacyInList) {
      previousTtnList.push(legacySingleTtn);
    }

    const nextTtnEntry = {
      number: saved.documentNumber,
      ref: saved.documentRef,
      cost: saved.cost,
      createdAt: saved.createdAt,
    };

    const nextTtnList = [...previousTtnList, nextTtnEntry];

    const nextDeliveryData = {
      ...prev,
      novaPoshta: {
        ...prevNp,

        recipientType: d.recipientType ?? null,
        deliveryType: d.deliveryType ?? null,

        cityRef: d.cityRef ?? null,
        cityName: d.cityName ?? null,

        warehouseRef: d.warehouseRef ?? null,
        warehouseNumber: d.warehouseNumber ?? null,
        warehouseType: d.warehouseType ?? null,

        streetRef: d.streetRef ?? null,
        streetName: d.streetName ?? null,
        building: d.building ?? null,
        flat: d.flat ?? null,

        ttn: nextTtnEntry,
        ttns: nextTtnList,
      },
    };

    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        deliveryData: nextDeliveryData as any,
        ...(order.status === "NEW" ? { status: "IN_WORK" } : {}),
      },
    });
  }

  // ======================
  // PUBLIC: get NP status by orderId (+ optional sync)
  // ======================
  async getTtnStatusByOrderId(orderId: string, opts?: { sync?: boolean }) {
    const last = await this.prisma.orderTtn.findFirst({
      where: { orderId, carrier: "NOVA_POSHTA" as any },
      orderBy: { createdAt: "desc" },
    });

    if (!last?.documentNumber) throw new NotFoundException("TTN not found for this order");

    if (opts?.sync === false) {
      return { ok: true, fromCache: true, ttn: last.documentNumber, snapshot: last.payloadSnapshot ?? null };
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

    let resp: any;
    try {
      resp = await this.np.call<any>("TrackingDocument", "getStatusDocuments", payload);
    } catch (e: any) {
      throw new BadRequestException(`NP status error: ${e?.message || e}`);
    }

    const row = resp?.data?.[0];
    if (!row) {
      const errors = Array.isArray(resp?.errors) ? resp.errors.join("; ") : "";
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
        estimatedDeliveryDate:
          this.tryParseNpDateTime(row?.ScheduledDeliveryDate) ?? null,
        payloadSnapshot: {
          ...(last.payloadSnapshot as any),
          statusRequest: payload,
          statusResponse: resp,
        } as any,
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

    // Use raw query with status::text to avoid enum-mismatch crashes in cron.
    const orders = await this.prisma.$queryRaw<Array<{ id: string; deliveryData: any }>>`
      SELECT o."id", o."deliveryData"
      FROM "Order" o
      WHERE o."deliveryMethod"::text = 'NOVA_POSHTA'
        AND COALESCE(o."status"::text, '') NOT IN ('SUCCESS', 'CANCELED', 'RETURNING')
        AND (o."deliveryData" #>> '{novaPoshta,ttn,number}') IS NOT NULL
      ORDER BY o."updatedAt" DESC
      LIMIT ${limit}
    `;

    const docs = orders
      .map((o) => ({
        orderId: o.id,
        ttn: (o as any)?.deliveryData?.novaPoshta?.ttn?.number as
          | string
          | undefined,
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

      const resp = await this.np.call<any>("TrackingDocument", "getStatusDocuments", {
        Documents: chunk.map((x) => ({ DocumentNumber: x.ttn })),
      });

      const arr = Array.isArray(resp?.data) ? resp.data : [];
      const byNumber = new Map<string, any>();
      for (const s of arr) if (s?.Number) byNumber.set(String(s.Number), s);

      for (const item of chunk) {
        const status = byNumber.get(item.ttn);
        if (!status) {
          skipped++;
          continue;
        }
        try {
          const updated = await this.persistOrderNpStatus(item.orderId, status);
          if (updated) updatedOrders++;
        } catch (e: any) {
          skipped++;
          this.logger.warn(
            `Skip order ${item.orderId} during TTN sync: ${e?.message || String(e)}`,
          );
        }
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
    if (code === "2" || text.includes("видал") || text.includes("удален"))
      return "CANCELED";

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
    if (
      ["9", "10", "11"].includes(code) ||
      text.includes("отрим") ||
      text.includes("получено")
    ) {
      return debt <= 0.00001 ? "SUCCESS" : "PAYMENT_CONTROL";
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
    if (code === "1" || text.includes("створив") || text.includes("создан"))
      return "IN_WORK";

    return null;
  }

  private shouldAdvanceOrderStatus(current: string, next: string) {
    // terminal guards
    if (current === "CANCELED") return false;
    if (current === "SUCCESS" && next !== "SUCCESS") return false;

    // RETURNING/CANCELED перебивают почти всегда (кроме SUCCESS выше)
    if (next === "CANCELED") return true;
    if (next === "RETURNING") return true;

    const rank: Record<string, number> = {
      NEW: 10,
      IN_WORK: 20,
      READY_TO_SHIP: 30,
      SHIPPED: 40,
      PAYMENT_CONTROL: 50,
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
  private async persistOrderNpStatus(orderId: string, status: any) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        status: string;
        debtAmount: number | null;
        deliveryMethod: string | null;
        deliveryData: any;
        lastTtnId: string | null;
      }>
    >`
      SELECT
        o."id",
        o."status"::text AS "status",
        o."debtAmount",
        o."deliveryMethod"::text AS "deliveryMethod",
        o."deliveryData",
        (
          SELECT t."id"
          FROM "OrderTtn" t
          WHERE t."orderId" = o."id"
          ORDER BY t."createdAt" DESC
          LIMIT 1
        ) AS "lastTtnId"
      FROM "Order" o
      WHERE o."id" = ${orderId}
      LIMIT 1
    `;
    const order = rows[0];
    if (!order) return false;

    // Самовывоз: НП не трогаем (и не делаем auto SUCCESS тут)
    if (order.deliveryMethod === "PICKUP") return true;

    const prev = (order as any).deliveryData ?? {};
    const prevNp = prev?.novaPoshta ?? {};

    const nextDeliveryData = {
      ...prev,
      novaPoshta: {
        ...prevNp,
        status: status ?? null,
      },
    };

    const currentStatus = String(order.status);
    const mapped = this.mapNpToOrderStatus({
      npCode: status?.StatusCode,
      npText: status?.Status,
      debtAmount: order.debtAmount,
    });

    const updateData: any = { deliveryData: nextDeliveryData as any };

    if (
      mapped &&
      mapped !== currentStatus &&
      this.shouldAdvanceOrderStatus(currentStatus, mapped)
    ) {
      updateData.status = this.resolveStatusForWrite(mapped, currentStatus) as any;
    }

    await this.prisma.$transaction(async (tx) => {
      try {
        await tx.order.update({
          where: { id: order.id },
          data: updateData,
          select: { id: true },
        });
      } catch (e: any) {
        if (!this.isOrderStatusEnumMismatchError(e) || !updateData.status) {
          throw e;
        }

        const fallbackStatus = this.resolveStatusAliasFallback(updateData.status);
        if (fallbackStatus) {
          await tx.order.update({
            where: { id: order.id },
            data: { ...updateData, status: fallbackStatus as any },
            select: { id: true },
          });
        } else {
          await tx.order.update({
            where: { id: order.id },
            data: { deliveryData: nextDeliveryData as any },
            select: { id: true },
          });
        }
      }

      // Обновим последнюю TTN полями статуса (если есть)
      const lastTtnId = order.lastTtnId;
      if (lastTtnId) {
        await tx.orderTtn.update({
          where: { id: lastTtnId },
          data: {
            statusCode: status?.StatusCode != null ? String(status.StatusCode) : null,
            statusText: status?.Status != null ? String(status.Status) : null,
            estimatedDeliveryDate:
              this.tryParseNpDateTime(status?.ScheduledDeliveryDate) ?? null,
            // updatedAt в Prisma @updatedAt обновится сам на update
          },
        });
      }
    });

    return true;
  }

  private resolveStatusForWrite(mapped: OrderStatus, currentStatus: string): OrderStatus {
    if (mapped === "PAYMENT_CONTROL" && currentStatus === "CONTROL_PAYMENT") {
      return "CONTROL_PAYMENT";
    }
    if (mapped === "CONTROL_PAYMENT" && currentStatus === "PAYMENT_CONTROL") {
      return "PAYMENT_CONTROL";
    }
    return mapped;
  }

  private resolveStatusAliasFallback(status: string): OrderStatus | null {
    if (status === "PAYMENT_CONTROL") return "CONTROL_PAYMENT";
    if (status === "CONTROL_PAYMENT") return "PAYMENT_CONTROL";
    return null;
  }

  private isOrderStatusEnumMismatchError(error: unknown) {
    const msg = String((error as any)?.message ?? error ?? "");
    return (
      msg.includes("invalid input value for enum \"OrderStatus\"") ||
      (msg.includes("Value") && msg.includes("not found in enum 'OrderStatus'"))
    );
  }

  private tryParseNpDateTime(v: any): Date | null {
    // NP часто возвращает "12-02-2026 09:00:00"
    const s = String(v ?? "").trim();
    if (!s) return null;

    const m = s.match(
      /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/,
    );
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
