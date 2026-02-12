// src/np/np-ttn.service.ts

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NpClient } from "./np-client.service";
import { CreateNpTtnDto, NpDeliveryType, NpRecipientType } from "./dto/create-np-ttn.dto";

type SenderCache = {
  senderCityRef: string;
  senderWarehouseRef: string;
  senderCounterpartyRef: string;
  senderContactRef: string;
  senderPhone: string;
  senderAddressName?: string; // только для debug, в payload не отправляем
};

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
      include: { contact: true },
    });

    if (!order) throw new BadRequestException("order not found");
    if (!order.contactId) throw new BadRequestException("order.contactId is required");
    if (!order.contact) throw new BadRequestException("contact not found");

    const resolved = await this.resolveRecipientData(order.contact.id, dto);

    // 1) ensure NP entities (Recipient counterparty/contact/address)
    const npRefs = await this.ensureNpRecipientRefs(resolved);

    // 2) build payload
    const payload = await this.buildInternetDocumentPayload({ dto, resolved, npRefs });

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
      throw new BadRequestException(`NP: no IntDocNumber in response${errors ? `. Errors: ${errors}` : ""}`);
    }

    // 4) save TTN record
    const saved = await this.prisma.orderTtn.create({
      data: {
        orderId: order.id,
        carrier: "NOVA_POSHTA" as any,
        documentNumber: docData.IntDocNumber,
        documentRef: docData.Ref || null,
        cost: docData.CostOnSite ? Number(docData.CostOnSite) : null,
        payloadSnapshot: { request: payload, response: doc },
      },
    });

    // 4.5) persist TTN into Order.deliveryData (+ move NEW -> IN_WORK)
    await this.persistOrderDeliveryDataWithTtn(order, resolved, saved);

    // 5) persist profile updates (including NP refs)
    await this.upsertShippingProfile(order.contact.id, dto, resolved, npRefs);

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
      const profile = await this.prisma.contactShippingProfile.findUnique({ where: { id: dto.profileId } });
      if (!profile || profile.contactId !== contactId) throw new BadRequestException("profile not found");

      return { sourceProfile: profile, data: { ...profile, ...(dto.draft ?? {}) } };
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
    if (!senderCounterpartyRef) throw new BadRequestException("Set NP_SENDER_COUNTERPARTY_REF in .env");
    if (!senderContactRef) throw new BadRequestException("Set NP_SENDER_CONTACT_REF in .env");
    if (!senderPhoneEnv) throw new BadRequestException("Set NP_SENDER_PHONE in .env");

    const city = await this.prisma.npCity.findUnique({ where: { ref: senderCityRef } });
    if (!city) throw new BadRequestException(`Sender cityRef not found in cache: ${senderCityRef}. Run POST /np/sync`);

    const wh = await this.prisma.npWarehouse.findUnique({ where: { ref: senderWarehouseRef } });
    if (!wh) throw new BadRequestException(`Sender warehouseRef not found in cache: ${senderWarehouseRef}. Run POST /np/sync`);

    if (wh.cityRef !== senderCityRef) {
      throw new BadRequestException(`Sender warehouseRef city mismatch: wh.cityRef=${wh.cityRef} vs NP_SENDER_CITY_REF=${senderCityRef}`);
    }
    if ((wh as any).isPostomat) throw new BadRequestException("Sender warehouseRef points to postomat. Use real warehouse ref.");

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

        FirstName: isPerson ? d.firstName : undefined,
        LastName: isPerson ? d.lastName : undefined,
        MiddleName: isPerson ? d.middleName : undefined,
        Phone: isPerson ? this.normalizeNpPhone(d.phone) : undefined,

        Description: !isPerson ? d.companyName : undefined,
        EDRPOU: !isPerson ? d.edrpou : undefined,
      });

      refs.counterpartyRef = cp?.data?.[0]?.Ref;
      if (!refs.counterpartyRef) throw new BadRequestException("NP: Counterparty.save did not return Ref");
    }

    // ContactPerson
    if (!refs.contactPersonRef) {
      const isPerson = d.recipientType === NpRecipientType.PERSON;

      const firstName = isPerson ? d.firstName : d.contactPersonFirstName;
      const lastName = isPerson ? d.lastName : d.contactPersonLastName;
      const middleName = isPerson ? d.middleName : d.contactPersonMiddleName;
      const phone = isPerson ? d.phone : d.contactPersonPhone;

      if (!firstName || !lastName || !phone) {
        throw new BadRequestException("Recipient contact fields required: firstName, lastName, phone");
      }

      const cp = await this.np.call<any>("ContactPerson", "save", {
        CounterpartyRef: refs.counterpartyRef,
        FirstName: firstName,
        LastName: lastName,
        MiddleName: middleName || "",
        Phone: this.normalizeNpPhone(phone),
      });

      refs.contactPersonRef = cp?.data?.[0]?.Ref;
      if (!refs.contactPersonRef) throw new BadRequestException("NP: ContactPerson.save did not return Ref");
    }

    // Address only for ADDRESS
    if (d.deliveryType === NpDeliveryType.ADDRESS && !refs.addressRef) {
      if (!d.streetRef || !d.building) throw new BadRequestException("For ADDRESS delivery streetRef and building are required");

      const adr = await this.np.call<any>("Address", "save", {
        CounterpartyRef: refs.counterpartyRef,
        StreetRef: d.streetRef,
        BuildingNumber: d.building,
        Flat: d.flat || "",
        Note: "CRM",
      });

      refs.addressRef = adr?.data?.[0]?.Ref;
      if (!refs.addressRef) throw new BadRequestException("NP: Address.save did not return Ref");
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
      recipientAddressName = `${d.streetName ?? ""} ${d.building ?? ""}`.trim() || "Address";
    } else {
      if (!d.warehouseRef) throw new BadRequestException("WAREHOUSE/POSTOMAT: warehouseRef is required");

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

  // ======================
  // Save profile to contact
  // ======================
  private async upsertShippingProfile(contactId: string, dto: CreateNpTtnDto, resolved: any, npRefs: any) {
    const d = resolved.data;

    const shouldSave = dto.saveAsProfile ?? true;
    if (!shouldSave) return;

    const label =
      dto.profileLabel ||
      d.label ||
      (d.deliveryType === NpDeliveryType.ADDRESS ? "Адрес" : d.deliveryType === NpDeliveryType.POSTOMAT ? "Поштомат" : "Отделение");

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
      await this.prisma.contactShippingProfile.update({ where: { id: dto.profileId }, data: profileData });
      return;
    }

    await this.prisma.contactShippingProfile.create({ data: { contactId, ...profileData } });
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
      throw new BadRequestException(`NP status: empty response${errors ? `. Errors: ${errors}` : ""}`);
    }

    // обновим TTN (status fields + snapshot)
    await this.prisma.orderTtn.update({
      where: { id: last.id },
      data: {
        statusCode: row?.StatusCode != null ? String(row.StatusCode) : null,
        statusText: row?.Status != null ? String(row.Status) : null,
        estimatedDeliveryDate: this.tryParseNpDateTime(row?.ScheduledDeliveryDate) ?? null,
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

    const orders = await this.prisma.order.findMany({
      where: {
        deliveryMethod: "NOVA_POSHTA" as any,
        status: { notIn: ["SUCCESS", "CANCELED"] as any },
        deliveryData: {
          path: ["novaPoshta", "ttn", "number"],
          not: null,
        } as any,
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: { id: true, deliveryData: true },
    });

    const docs = orders
      .map((o) => ({
        orderId: o.id,
        ttn: (o as any)?.deliveryData?.novaPoshta?.ttn?.number as string | undefined,
      }))
      .filter((x) => !!x.ttn) as Array<{ orderId: string; ttn: string }>;

    // chunk by 100
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
        const updated = await this.persistOrderNpStatus(item.orderId, status);
        if (updated) updatedOrders++;
      }
    }

    return { ok: true, checked, updatedOrders, skipped };
  }

  // ======================
  // PRIVATE: mapping NP StatusCode -> OrderStatus (Variant A)
  // ======================
  private mapNpStatusToOrderStatus(code: string | number | undefined) {
    const c = String(code ?? "").trim();
    if (!c) return null;

    // 1 — створено, але ще не надано до відправки (ты видел это)
    if (c === "1") return "IN_WORK";

    // 2 — иногда удалено/отменено (оставим как CANCELED)
    if (c === "2") return "CANCELED";

    // Delivered / Received
    if (["9", "10", "11"].includes(c)) return "PAYMENT_CONTROL";

    // Returning / refused / not delivered (часто такие коды встречаются)
    if (["102", "103", "104", "105"].includes(c)) return "RETURNING";

    // In transit / accepted / arrived / moved (широкий диапазон — уточним по твоим данным)
    if (["3", "4", "41", "5", "6", "7", "8", "101"].includes(c)) return "SHIPPED";

    return null;
  }

  private shouldAdvanceOrderStatus(current: string, next: string) {
    // терминальные
    if (current === "CANCELED") return false;
    if (current === "SUCCESS") return false;

    // возврат/отмена должны перебивать
    if (next === "CANCELED") return true;
    if (next === "RETURNING") return true;

    const rank: Record<string, number> = {
      NEW: 10,
      IN_WORK: 20,
      READY_TO_SHIP: 30,
      SHIPPED: 40,
      PAYMENT_CONTROL: 50,
      RETURNING: 55, // выше PAYMENT_CONTROL не делаем, но "перебивает" отдельным правилом выше
      SUCCESS: 60,
      CANCELED: 99,
    };

    return (rank[next] ?? 0) > (rank[current] ?? 0);
  }

  private applySuccessRule(mapped: string | null, orderDebtAmount: any) {
    if (mapped !== "PAYMENT_CONTROL") return mapped;
    const debt = Number(orderDebtAmount ?? 0);
    if (debt <= 0.00001) return "SUCCESS";
    return "PAYMENT_CONTROL";
  }

  // ======================
  // PRIVATE: persist NP tracking status & map to order.status
  // ======================
  private async persistOrderNpStatus(orderId: string, status: any) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, debtAmount: true, deliveryMethod: true, deliveryData: true },
    });
    if (!order) return false;

    // Если самовывоз — НП не трогаем (на всякий)
    if ((order as any).deliveryMethod === "PICKUP") {
      const next = this.applySuccessRule("PAYMENT_CONTROL", (order as any).debtAmount);
      if (next && this.shouldAdvanceOrderStatus(String(order.status), next)) {
        await this.prisma.order.update({ where: { id: order.id }, data: { status: next as any } });
      }
      return true;
    }

    const prev = (order as any).deliveryData ?? {};
    const prevNp = prev?.novaPoshta ?? {};

    const nextDeliveryData = {
      ...prev,
      novaPoshta: {
        ...prevNp,
        status: status ?? null, // кладем весь объект трекинга
      },
    };

    const mapped0 = this.mapNpStatusToOrderStatus(status?.StatusCode);
    const mapped = this.applySuccessRule(mapped0, (order as any).debtAmount);

    const updateData: any = { deliveryData: nextDeliveryData as any };

    if (mapped && mapped !== order.status && this.shouldAdvanceOrderStatus(String(order.status), mapped)) {
      updateData.status = mapped;
    }

    await this.prisma.order.update({
      where: { id: order.id },
      data: updateData,
    });

    return true;
  }

  private tryParseNpDateTime(v: any): Date | null {
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

    const dt = new Date(Date.UTC(yyyy, mm - 1, dd, hh, mi, ss));
    return Number.isFinite(dt.getTime()) ? dt : null;
  }
}
