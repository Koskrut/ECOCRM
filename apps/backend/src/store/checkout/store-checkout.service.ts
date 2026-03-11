import { BadRequestException, Injectable } from "@nestjs/common";
import { NpDeliveryType, NpRecipientType, OrderSource } from "@prisma/client";
import { randomBytes } from "crypto";
import { signJwt } from "../../auth/jwt";
import { hashPassword } from "../../auth/password";
import { ContactsService } from "../../contacts/contacts.service";
import { OrdersService } from "../../orders/orders.service";
import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "../../settings/settings.service";
import { StoreCartService } from "../cart/store-cart.service";
import type { CreateOrderDto } from "../../orders/dto/create-order.dto";
import type { StoreCheckoutDto } from "./dto/store-checkout.dto";

function normalizePhone(phone: string): string {
  return String(phone ?? "").replace(/\D/g, "");
}

@Injectable()
export class StoreCheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contactsService: ContactsService,
    private readonly ordersService: OrdersService,
    private readonly cartService: StoreCartService,
    private readonly settings: SettingsService,
  ) {}

  async checkout(dto: StoreCheckoutDto) {
    const sessionId = dto.sessionId?.trim();
    if (!sessionId) throw new BadRequestException("sessionId required for cart");
    const cart = await this.cartService.getCart({ sessionId });
    if (!cart.items.length) throw new BadRequestException("Cart is empty");

    const rawPhone = (dto.phone ?? "").trim();
    const phoneNorm = normalizePhone(rawPhone);
    if (!phoneNorm) throw new BadRequestException("Введіть номер телефону");
    if (phoneNorm.length < 9) throw new BadRequestException("Номер телефону має містити щонайменше 9 цифр");

    const firstName = (dto.firstName ?? (dto as { name?: string }).name ?? "").trim();
    if (!firstName) throw new BadRequestException("Введіть ім'я");

    const deliveryMethod = dto.deliveryMethod;
    if (!deliveryMethod || !["PICKUP", "NOVA_POSHTA"].includes(deliveryMethod)) {
      throw new BadRequestException("Оберіть спосіб доставки");
    }

    let contact = await this.contactsService.findContactByPhone(phoneNorm);
    const lastName = (dto.lastName ?? "").trim() || "—";
    const email = (dto.email ?? "").trim() || null;
    if (!contact) {
      contact = await this.contactsService.create(
        {
          firstName,
          lastName,
          phone: rawPhone || phoneNorm,
          email,
        },
        undefined,
      ) as { id: string };
    } else {
      await this.contactsService.update(
        contact.id,
        { firstName, lastName, email },
        undefined,
      );
    }

    let orderDeliveryData: Record<string, unknown> | undefined;
    if (deliveryMethod === "NOVA_POSHTA") {
      const dd = dto.deliveryData as
        | {
            profileId?: string;
            recipientType?: "PERSON" | "COMPANY";
            deliveryType?: "WAREHOUSE" | "POSTOMAT" | "ADDRESS";
            cityRef?: string;
            cityName?: string;
            warehouseRef?: string;
            warehouseName?: string;
            warehouseNumber?: string;
            warehouseType?: string;
            streetRef?: string;
            streetName?: string;
            building?: string;
            flat?: string;
            recipientName?: string;
            firstName?: string;
            lastName?: string;
            recipientPhone?: string;
            phone?: string;
            companyName?: string;
            edrpou?: string;
            contactPersonFirstName?: string;
            contactPersonLastName?: string;
            contactPersonMiddleName?: string;
            contactPersonPhone?: string;
            saveAsProfile?: boolean;
            profileLabel?: string;
          }
        | undefined
        | null;
      if (!dd) throw new BadRequestException("Для доставки Новою поштою вкажіть адресу або оберіть профіль");
      const profileId = dd.profileId?.trim();
      if (profileId) {
        const profile = await this.prisma.contactShippingProfile.findUnique({
          where: { id: profileId },
        });
        if (!profile || profile.contactId !== contact.id) {
          throw new BadRequestException("Профіль доставки не знайдено");
        }
        orderDeliveryData = {
          novaPoshta: {
            recipientType: profile.recipientType,
            deliveryType: profile.deliveryType,
            cityRef: profile.cityRef,
            cityName: profile.cityName,
            warehouseRef: profile.warehouseRef,
            warehouseNumber: profile.warehouseNumber,
            warehouseType: profile.warehouseType,
            streetRef: profile.streetRef,
            streetName: profile.streetName,
            building: profile.building,
            flat: profile.flat,
            firstName: profile.firstName,
            lastName: profile.lastName,
            middleName: profile.middleName,
            phone: profile.phone,
            companyName: profile.companyName,
            edrpou: profile.edrpou,
            contactPersonFirstName: profile.contactPersonFirstName,
            contactPersonLastName: profile.contactPersonLastName,
            contactPersonMiddleName: profile.contactPersonMiddleName,
            contactPersonPhone: profile.contactPersonPhone,
          },
        };
      } else {
        const recipientType = dd.recipientType as "PERSON" | "COMPANY" | undefined;
        const deliveryType = dd.deliveryType as "WAREHOUSE" | "POSTOMAT" | "ADDRESS" | undefined;
        if (!recipientType || !["PERSON", "COMPANY"].includes(recipientType)) {
          throw new BadRequestException("Оберіть тип отримувача: фізична особа або організація");
        }
        if (!deliveryType || !["WAREHOUSE", "POSTOMAT", "ADDRESS"].includes(deliveryType)) {
          throw new BadRequestException("Оберіть тип доставки: відділення, поштомат або адреса");
        }
        const cityRef = dd.cityRef?.trim();
        const cityName = dd.cityName?.trim() || null;
        if (!cityRef) throw new BadRequestException("Місто обов'язкове");

        let warehouseRef: string | null = null;
        let warehouseNumber: string | null = null;
        let warehouseType: string | null = null;
        let streetRef: string | null = null;
        let streetName: string | null = null;
        let building: string | null = null;
        let flat: string | null = null;

        if (deliveryType === "WAREHOUSE" || deliveryType === "POSTOMAT") {
          const whRef = dd.warehouseRef?.trim();
          if (!whRef) throw new BadRequestException("Оберіть відділення або поштомат");
          const wh = await this.prisma.npWarehouse.findUnique({ where: { ref: whRef } });
          if (wh) {
            warehouseRef = whRef;
            warehouseNumber = (wh as { number?: string | null }).number ?? null;
            warehouseType = (wh as { isPostomat?: boolean }).isPostomat ? "POSTOMAT" : "WAREHOUSE";
          } else {
            warehouseRef = whRef;
            warehouseType = deliveryType;
          }
        } else {
          streetRef = dd.streetRef?.trim() || null;
          streetName = dd.streetName?.trim() || null;
          building = dd.building?.trim() || null;
          flat = dd.flat?.trim() || null;
          if (!streetRef || !building) {
            throw new BadRequestException("Для доставки на адресу вкажіть вулицю та номер будинку");
          }
        }

        let firstName: string | null = null;
        let lastName: string | null = null;
        let middleName: string | null = null;
        let phone: string | null = null;
        let companyName: string | null = null;
        let edrpou: string | null = null;
        let contactPersonFirstName: string | null = null;
        let contactPersonLastName: string | null = null;
        let contactPersonMiddleName: string | null = null;
        let contactPersonPhone: string | null = null;

        if (recipientType === "PERSON") {
          const name = (dd.firstName?.trim() || dd.recipientName?.trim() || "").trim();
          const last = dd.lastName?.trim();
          if (!name && !last) throw new BadRequestException("Вкажіть ПІБ отримувача");
          phone = (dd.recipientPhone?.trim() || dd.phone?.trim() || "").trim();
          if (!phone) throw new BadRequestException("Вкажіть телефон отримувача");
          if (last) {
            firstName = name || null;
            lastName = last;
          } else {
            const [firstPart, ...rest] = name.split(/\s+/);
            firstName = firstPart || null;
            lastName = rest.length ? rest.join(" ") : null;
          }
        } else {
          companyName = dd.companyName?.trim() || null;
          edrpou = dd.edrpou?.trim() || null;
          contactPersonFirstName = dd.contactPersonFirstName?.trim() || null;
          contactPersonLastName = dd.contactPersonLastName?.trim() || null;
          contactPersonMiddleName = dd.contactPersonMiddleName?.trim() || null;
          contactPersonPhone = dd.contactPersonPhone?.trim() || null;
          if (!companyName || !edrpou) throw new BadRequestException("Вкажіть назву компанії та ЄДРПОУ");
          if (!contactPersonFirstName && !contactPersonLastName) {
            throw new BadRequestException("Вкажіть контактну особу");
          }
          if (!contactPersonPhone) throw new BadRequestException("Вкажіть телефон контактної особи");
        }

        const novaPoshta: Record<string, unknown> = {
          recipientType: recipientType as NpRecipientType,
          deliveryType: deliveryType as NpDeliveryType,
          cityRef,
          cityName,
          warehouseRef,
          warehouseNumber,
          warehouseType,
          streetRef,
          streetName,
          building,
          flat,
          firstName,
          lastName,
          middleName,
          phone,
          companyName,
          edrpou,
          contactPersonFirstName,
          contactPersonLastName,
          contactPersonMiddleName,
          contactPersonPhone,
        };
        orderDeliveryData = { novaPoshta };

        if (dd.saveAsProfile) {
          const label = dd.profileLabel?.trim() || cityName || "Нова пошта";
          await this.prisma.contactShippingProfile.create({
            data: {
              contactId: contact.id,
              label,
              isDefault: false,
              recipientType: recipientType as NpRecipientType,
              deliveryType: deliveryType as NpDeliveryType,
              firstName,
              lastName,
              middleName,
              phone,
              companyName,
              edrpou,
              contactPersonFirstName,
              contactPersonLastName,
              contactPersonMiddleName,
              contactPersonPhone,
              cityRef,
              cityName,
              warehouseRef,
              warehouseNumber,
              warehouseType,
              streetRef,
              streetName,
              building,
              flat,
            },
          });
        }
      }
    }

    const storeOwnerId = process.env.STORE_OWNER_ID;
    if (!storeOwnerId) throw new BadRequestException("Store not configured (STORE_OWNER_ID)");

    const rates = await this.settings.getExchangeRates();
    const uahPerUsd = rates.UAH_TO_USD > 0 ? 1 / rates.UAH_TO_USD : 41;

    const order = await this.ordersService.create(
      {
        ownerId: storeOwnerId,
        clientId: contact.id,
        contactId: contact.id,
        orderSource: OrderSource.STORE,
        comment: dto.comment ?? undefined,
        deliveryMethod: dto.deliveryMethod ?? undefined,
        paymentMethod: dto.paymentMethod ?? undefined,
        paymentType: dto.paymentType ?? undefined,
        deliveryData: (orderDeliveryData ?? undefined) as CreateOrderDto["deliveryData"],
      },
      undefined,
    ) as { id: string; orderNumber: string };

    for (const item of cart.items) {
      const priceUah = Math.round(item.price * uahPerUsd * 100) / 100;
      await this.ordersService.addItem(
        order.id,
        { productId: item.productId, qty: item.qty, price: priceUah },
        undefined,
      );
    }

    await this.cartService.clearCart({ sessionId });

    let setPasswordToken: string | null = null;
    let alreadyHadAccount = false;
    let customer = await this.prisma.customer.findUnique({
      where: { contactId: contact.id },
    });
    if (!customer) {
      const tempPassword = randomBytes(24).toString("hex");
      customer = await this.prisma.customer.create({
        data: {
          contactId: contact.id,
          email: dto.email?.trim() || null,
          passwordHash: hashPassword(tempPassword),
        },
      });
      const secret = process.env.JWT_SECRET;
      if (secret) {
        setPasswordToken = signJwt(
          { contactId: contact.id, purpose: "set-password", sub: customer.id },
          secret,
          { expiresInSeconds: 60 * 60 * 24 },
        );
      }
    } else {
      alreadyHadAccount = true;
    }

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      contactId: contact.id,
      setPasswordToken,
      alreadyHadAccount,
    };
  }
}
