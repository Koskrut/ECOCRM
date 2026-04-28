import { BadRequestException, Injectable } from "@nestjs/common";
import {
  NpDeliveryType,
  NpRecipientType,
  OrderSource,
  ReservationHardness,
  ReservationStatus,
} from "@prisma/client";
import { signJwt } from "../../auth/jwt";
import { hashPassword } from "../../auth/password";
import { ContactsService } from "../../contacts/contacts.service";
import { getPhoneNormalizedDigits, normalizePhoneToE164 } from "../../common/phone.utils";
import { IntegrationPortsService } from "../../integration-ports/integration-ports.service";
import { OrdersService } from "../../orders/orders.service";
import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "../../settings/settings.service";
import { resolveAssignedManagerForRegion } from "../../settings/org-chart-region-resolver";
import { StoreCartService } from "../cart/store-cart.service";
import { ProductStore } from "../../products/product.store";
import type { CreateOrderDto } from "../../orders/dto/create-order.dto";
import type { StoreCheckoutDto } from "./dto/store-checkout.dto";

/** Mirrors store auth lookup so checkout does not create duplicate contacts. */
function getPhoneCandidatesForLookup(phoneNorm: string): string[] {
  const candidates = new Set<string>();
  candidates.add(phoneNorm);
  if (phoneNorm.length === 10 && phoneNorm.startsWith("0")) {
    candidates.add("38" + phoneNorm);
  }
  if (phoneNorm.length === 9 && phoneNorm.startsWith("9")) {
    candidates.add("0" + phoneNorm);
    candidates.add("380" + phoneNorm);
  }
  if (phoneNorm.length === 12 && phoneNorm.startsWith("380")) {
    candidates.add("0" + phoneNorm.slice(3));
  }
  return Array.from(candidates);
}

@Injectable()
export class StoreCheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contactsService: ContactsService,
    private readonly ordersService: OrdersService,
    private readonly cartService: StoreCartService,
    private readonly settings: SettingsService,
    private readonly integrations: IntegrationPortsService,
    private readonly productStore: ProductStore,
  ) {}

  async checkout(dto: StoreCheckoutDto) {
    const sessionId = dto.sessionId?.trim();
    if (!sessionId) throw new BadRequestException("sessionId required for cart");
    const cart = await this.cartService.getCart({ sessionId });
    if (!cart.items.length) throw new BadRequestException("Cart is empty");

    for (const item of cart.items) {
      const product = await this.productStore.findById(item.productId);
      if (!product || !product.isActive || !product.showOnStore) {
        throw new BadRequestException(`Товар недоступний для замовлення: ${item.name}`);
      }
      const hardReservedAgg = await this.prisma.materialReservation.aggregate({
        where: {
          productId: item.productId,
          status: ReservationStatus.ACTIVE,
          hardness: ReservationHardness.HARD,
        },
        _sum: { qty: true },
      });
      const hardReserved = hardReservedAgg._sum.qty ?? 0;
      const available = Math.max(0, product.stock - hardReserved);
      if (item.qty > available) {
        throw new BadRequestException(
          `Недостатньо товару на складі для "${item.name}". Доступно: ${available}, у кошику: ${item.qty}`,
        );
      }
    }

    const rawPhone = (dto.phone ?? "").trim();
    const phoneNorm = getPhoneNormalizedDigits(rawPhone);
    if (!phoneNorm) throw new BadRequestException("Введіть номер телефону");
    if (phoneNorm.length < 9) throw new BadRequestException("Номер телефону має містити щонайменше 9 цифр");

    const firstName = (dto.firstName ?? (dto as { name?: string }).name ?? "").trim();
    if (!firstName) throw new BadRequestException("Введіть ім'я");

    const deliveryMethod = dto.deliveryMethod;
    if (!deliveryMethod || !["PICKUP", "NOVA_POSHTA"].includes(deliveryMethod)) {
      throw new BadRequestException("Оберіть спосіб доставки");
    }

    const region = (dto.region ?? "").trim();
    if (!region) throw new BadRequestException("Оберіть область");

    const phoneCandidates = getPhoneCandidatesForLookup(phoneNorm);
    let contact: { id: string } | null = null;
    for (const candidate of phoneCandidates) {
      contact = await this.contactsService.findContactByPhone(candidate);
      if (contact) break;
    }
    const lastName = (dto.lastName ?? "").trim() || "—";
    const email = (dto.email ?? "").trim() || null;
    if (!contact) {
      contact = await this.contactsService.create(
        {
          firstName,
          lastName,
          phone: normalizePhoneToE164(rawPhone) ?? (rawPhone || phoneNorm),
          email,
          region,
        },
        undefined,
      ) as { id: string };
    } else {
      await this.contactsService.update(
        contact.id,
        { firstName, lastName, email, region },
        undefined,
      );
    }
    const existingCustomerBeforeCheckout = await this.prisma.customer.findUnique({
      where: { contactId: contact.id },
      select: { id: true },
    });

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
            middleName?: string;
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
            profileId: profile.id,
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
        let warehouseName: string | null = null;
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
            warehouseName = wh.description ?? dd.warehouseName?.trim() ?? null;
            warehouseNumber = (wh as { number?: string | null }).number ?? null;
            warehouseType = (wh as { isPostomat?: boolean }).isPostomat ? "POSTOMAT" : "WAREHOUSE";
          } else {
            warehouseRef = whRef;
            warehouseName = dd.warehouseName?.trim() || null;
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
            middleName = dd.middleName?.trim() || null;
          } else {
            const [firstPart, ...rest] = name.split(/\s+/);
            firstName = firstPart || null;
            lastName = rest.length ? rest.join(" ") : null;
            middleName = dd.middleName?.trim() || null;
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
          warehouseName,
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

        let savedProfileId: string | null = null;
        const shouldAutoCreateFirstProfileForRegistered =
          !!existingCustomerBeforeCheckout &&
          (await this.prisma.contactShippingProfile.count({
            where: { contactId: contact.id },
          })) === 0;
        if (dd.saveAsProfile || shouldAutoCreateFirstProfileForRegistered) {
          const label = dd.profileLabel?.trim() || cityName || "Нова пошта";
          const createdProfile = await this.prisma.contactShippingProfile.create({
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
          savedProfileId = createdProfile.id;
        }
        orderDeliveryData = {
          novaPoshta: {
            ...novaPoshta,
            ...(savedProfileId ? { profileId: savedProfileId } : {}),
          },
        };
      }
    }

    const org = await this.settings.getOrgChartStructure();
    const assignment = resolveAssignedManagerForRegion(org, region);
    const ownerIdFromRegion = assignment?.managerId ?? null;
    const storeOwnerId = process.env.STORE_OWNER_ID?.trim() || null;
    const ownerId = ownerIdFromRegion || storeOwnerId;
    if (!ownerId) {
      throw new BadRequestException("Для обраної області не призначено менеджера");
    }

    const rates = await this.settings.getExchangeRates();
    const uahPerUsd = rates.UAH_TO_USD > 0 ? 1 / rates.UAH_TO_USD : 41;

    const bankAccountId = await this.integrations.resolveStoreDefaultBankAccountIdForCheckout();

    const order = await this.ordersService.create(
      {
        ownerId,
        clientId: contact.id,
        contactId: contact.id,
        orderSource: OrderSource.STORE,
        comment: dto.comment ?? undefined,
        deliveryMethod: dto.deliveryMethod ?? undefined,
        paymentMethod: dto.paymentMethod ?? undefined,
        paymentType: dto.paymentType ?? undefined,
        deliveryData: (orderDeliveryData ?? undefined) as CreateOrderDto["deliveryData"],
        bankAccountId: bankAccountId ?? undefined,
      },
      undefined,
    ) as { id: string; orderNumber: string };

    for (const item of cart.items) {
      const priceUsd = Math.round(item.price * 100) / 100;
      await this.ordersService.addItem(
        order.id,
        { productId: item.productId, qty: item.qty, price: priceUsd },
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
      const rawPassword = (dto.password ?? "").trim();
      if (rawPassword.length < 6) {
        throw new BadRequestException("Пароль має бути не менше 6 символів");
      }
      customer = await this.prisma.customer.create({
        data: {
          contactId: contact.id,
          email: dto.email?.trim() || null,
          passwordHash: hashPassword(rawPassword),
        },
      });
    } else {
      alreadyHadAccount = true;
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) throw new Error("JWT_SECRET is not set");
    const orderPayToken = signJwt(
      { typ: "store_order_pay", orderId: order.id, contactId: contact.id },
      jwtSecret,
      { expiresInSeconds: 60 * 60 * 24 * 14 },
    );

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      contactId: contact.id,
      setPasswordToken,
      alreadyHadAccount,
      orderPayToken,
    };
  }
}
