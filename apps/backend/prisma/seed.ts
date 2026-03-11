// apps/backend/prisma/seed.ts
import "dotenv/config";
import {
  PrismaClient,
  UserRole,
  DeliveryMethod,
  PaymentMethod,
  LeadStatus,
  LeadSource,
  LeadChannel,
  LeadEventType,
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
/**
 * В проекте сейчас пароли без bcrypt:
 * - hashPassword() -> "plain:<password>"
 * - verifyPassword() проверяет этот префикс
 *
 * Поэтому в seed НЕ нужен bcrypt.
 */
const makePlainHash = (password: string) => `plain:${password}`;

const prisma = new PrismaClient({
  // Prisma 7 требует валидные PrismaClientOptions
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  // =========================
  // 1) Users
  // =========================
  const adminEmail = "admin@ecocrm.local";
  const adminPassword = "admin12345";

  const _admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      fullName: "Admin",
      role: UserRole.ADMIN,
      passwordHash: makePlainHash(adminPassword),
    },
    create: {
      email: adminEmail,
      fullName: "Admin",
      role: UserRole.ADMIN,
      passwordHash: makePlainHash(adminPassword),
    },
  });

  const _lead = await prisma.user.upsert({
    where: { email: "lead@ecocrm.local" },
    update: {
      fullName: "Team Lead",
      role: UserRole.LEAD,
      passwordHash: makePlainHash("lead12345"),
    },
    create: {
      email: "lead@ecocrm.local",
      fullName: "Team Lead",
      role: UserRole.LEAD,
      passwordHash: makePlainHash("lead12345"),
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: "manager@ecocrm.local" },
    update: {
      fullName: "Sales Manager",
      role: UserRole.MANAGER,
      passwordHash: makePlainHash("manager12345"),
    },
    create: {
      email: "manager@ecocrm.local",
      fullName: "Sales Manager",
      role: UserRole.MANAGER,
      passwordHash: makePlainHash("manager12345"),
    },
  });

  const storeUser = await prisma.user.upsert({
    where: { email: "store@ecocrm.local" },
    update: {
      fullName: "Store (магазин)",
      role: UserRole.MANAGER,
      passwordHash: makePlainHash("store"),
    },
    create: {
      email: "store@ecocrm.local",
      fullName: "Store (магазин)",
      role: UserRole.MANAGER,
      passwordHash: makePlainHash("store"),
    },
  });
  console.log("STORE_OWNER_ID for .env:", storeUser.id);

  // =========================
  // 2) Company + Contacts
  // =========================
  const company = await prisma.company.upsert({
    where: { id: "demo-company" },
    update: {
      name: "Demo Company LLC",
      edrpou: "12345678",
      taxId: "UA1234567890",
    },
    create: {
      id: "demo-company",
      name: "Demo Company LLC",
      edrpou: "12345678",
      taxId: "UA1234567890",
    },
  });

  const contact1 = await prisma.contact.upsert({
    where: { id: "demo-contact-1" },
    update: {
      companyId: company.id,
      firstName: "Іван",
      lastName: "Петренко",
      phone: "380501111111",
      email: "ivan.petrenko@example.com",
      position: "Procurement",
      isPrimary: true,
    },
    create: {
      id: "demo-contact-1",
      companyId: company.id,
      firstName: "Іван",
      lastName: "Петренко",
      phone: "380501111111",
      email: "ivan.petrenko@example.com",
      position: "Procurement",
      isPrimary: true,
    },
  });

  const contact2 = await prisma.contact.upsert({
    where: { id: "demo-contact-2" },
    update: {
      companyId: company.id,
      firstName: "Олена",
      lastName: "Коваленко",
      phone: "380502222222",
      email: "olena.kovalenko@example.com",
      position: "Accountant",
      isPrimary: false,
    },
    create: {
      id: "demo-contact-2",
      companyId: company.id,
      firstName: "Олена",
      lastName: "Коваленко",
      phone: "380502222222",
      email: "olena.kovalenko@example.com",
      position: "Accountant",
      isPrimary: false,
    },
  });

  // =========================
  // 2b) Test Meta Lead (для вкладки «Источник» в карточке лида)
  // =========================
  const metaLead = await prisma.lead.upsert({
    where: { id: "demo-meta-lead" },
    update: {
      companyId: company.id,
      ownerId: manager.id,
      status: LeadStatus.NEW,
      source: LeadSource.META,
      channel: LeadChannel.FB_LEAD_ADS,
      firstName: "Марія",
      lastName: "Шевченко",
      fullName: "Марія Шевченко",
      phone: "+380501234567",
      phoneNormalized: "+380501234567",
      email: "maria.shevchenko@example.com",
      city: "Київ",
      message: "Цікавить преміум категорія",
      score: 2,
    },
    create: {
      id: "demo-meta-lead",
      companyId: company.id,
      ownerId: manager.id,
      status: LeadStatus.NEW,
      source: LeadSource.META,
      channel: LeadChannel.FB_LEAD_ADS,
      firstName: "Марія",
      lastName: "Шевченко",
      fullName: "Марія Шевченко",
      phone: "+380501234567",
      phoneNormalized: "+380501234567",
      email: "maria.shevchenko@example.com",
      city: "Київ",
      message: "Цікавить преміум категорія",
      score: 2,
    },
  });

  await prisma.leadMetaAttribution.upsert({
    where: { leadId: metaLead.id },
    update: {
      metaLeadId: "lead-demo-123",
      formId: "form-456",
      pageId: "123456789",
      campaignId: "camp-202",
      campaignName: "Spring Sale",
      adsetId: "adset-101",
      adsetName: "UA 25-45",
      adId: "ad-789",
      adName: "Lead Ad Creative",
      createdTime: new Date(Date.now() - 86400000),
    },
    create: {
      leadId: metaLead.id,
      metaLeadId: "lead-demo-123",
      formId: "form-456",
      pageId: "123456789",
      campaignId: "camp-202",
      campaignName: "Spring Sale",
      adsetId: "adset-101",
      adsetName: "UA 25-45",
      adId: "ad-789",
      adName: "Lead Ad Creative",
      createdTime: new Date(Date.now() - 86400000),
    },
  });

  await prisma.leadAnswer.deleteMany({ where: { leadId: metaLead.id } });
  await prisma.leadAnswer.createMany({
    data: [
      { leadId: metaLead.id, key: "first_name", value: "Марія" },
      { leadId: metaLead.id, key: "last_name", value: "Шевченко" },
      { leadId: metaLead.id, key: "city", value: "Київ" },
      { leadId: metaLead.id, key: "comment", value: "Цікавить преміум категорія" },
    ],
  });

  const existingEvent = await prisma.leadEvent.findFirst({
    where: { leadId: metaLead.id, type: LeadEventType.CREATED },
  });
  if (!existingEvent) {
    await prisma.leadEvent.create({
      data: {
        leadId: metaLead.id,
        type: LeadEventType.CREATED,
        message: "Лид создан из Meta Lead Ads",
      },
    });
  }

  // =========================
  // 3) Products
  // =========================
  const products = await Promise.all([
    prisma.product.upsert({
      where: { id: "p-1" },
      update: { sku: "SKU-001", name: "Product A", unit: "pcs", basePrice: 100, isActive: true },
      create: {
        id: "p-1",
        sku: "SKU-001",
        name: "Product A",
        unit: "pcs",
        basePrice: 100,
        isActive: true,
      },
    }),
    prisma.product.upsert({
      where: { id: "p-2" },
      update: { sku: "SKU-002", name: "Product B", unit: "pcs", basePrice: 250, isActive: true },
      create: {
        id: "p-2",
        sku: "SKU-002",
        name: "Product B",
        unit: "pcs",
        basePrice: 250,
        isActive: true,
      },
    }),
    prisma.product.upsert({
      where: { id: "p-3" },
      update: {
        sku: "SKU-003",
        name: "Service C",
        unit: "service",
        basePrice: 500,
        isActive: true,
      },
      create: {
        id: "p-3",
        sku: "SKU-003",
        name: "Service C",
        unit: "service",
        basePrice: 500,
        isActive: true,
      },
    }),
  ]);

  // =========================
  // 4) One demo order
  // =========================
  const order = await prisma.order.upsert({
    where: { orderNumber: "DEMO-0001" },
    update: {
      companyId: company.id,
      clientId: contact1.id,
      contactId: contact1.id,
      ownerId: manager.id,
      status: "NEW",
      currency: "UAH",
      deliveryMethod: DeliveryMethod.NOVA_POSHTA,
      paymentMethod: PaymentMethod.CASH,
      subtotalAmount: 0,
      discountAmount: 0,
      totalAmount: 0,
      paidAmount: 0,
      debtAmount: 0,
      comment: "Seed demo order",
    },
    create: {
      orderNumber: "DEMO-0001",
      companyId: company.id,
      clientId: contact1.id,
      contactId: contact1.id,
      ownerId: manager.id,
      status: "NEW",
      currency: "UAH",
      deliveryMethod: DeliveryMethod.NOVA_POSHTA,
      paymentMethod: PaymentMethod.CASH,
      subtotalAmount: 0,
      discountAmount: 0,
      totalAmount: 0,
      paidAmount: 0,
      debtAmount: 0,
      comment: "Seed demo order",
    },
  });

  // очистим items чтобы seed был идемпотентным
  await prisma.orderItem.deleteMany({ where: { orderId: order.id } });

  const item1Qty = 5;
  const item2Qty = 2;

  const item1 = await prisma.orderItem.create({
    data: {
      orderId: order.id,
      productId: products[0].id,
      qty: item1Qty,
      price: products[0].basePrice,
      lineTotal: item1Qty * products[0].basePrice,
    },
  });

  const item2 = await prisma.orderItem.create({
    data: {
      orderId: order.id,
      productId: products[1].id,
      qty: item2Qty,
      price: products[1].basePrice,
      lineTotal: item2Qty * products[1].basePrice,
    },
  });

  const subtotal = item1.lineTotal + item2.lineTotal;
  const total = subtotal;

  await prisma.order.update({
    where: { id: order.id },
    data: {
      subtotalAmount: subtotal,
      totalAmount: total,
      paidAmount: 0,
      debtAmount: total,
    },
  });

  // =========================
  // 4b) Payment module demo: BankAccount, unmatched BankTransaction, one Cash Payment
  // =========================
  const bankAccount = await prisma.bankAccount.upsert({
    where: { id: "seed-bank-1" },
    update: { name: "FOP Demo", currency: "UAH", isActive: true },
    create: {
      id: "seed-bank-1",
      provider: "PRIVAT24",
      name: "FOP Demo",
      currency: "UAH",
      accountNumber: "UA123456789012345678901234567",
      isActive: true,
    },
  });

  const unmatchedDescriptions = [
    "Payment for goods without order number",
    "Transfer #1234",
    "Invoice payment",
    "Refund customer",
    "Order 99999",
    "Prepayment",
    "Settlement",
    "Supplier payment",
    "Client ABC",
    "Misc income",
  ];
  for (let i = 0; i < 10; i++) {
    const dedupKey = `seed-tx-unmatched-${i + 1}`;
    await prisma.bankTransaction.upsert({
      where: {
        bankAccountId_dedupKey: {
          bankAccountId: bankAccount.id,
          dedupKey,
        },
      },
      update: {},
      create: {
        bankAccountId: bankAccount.id,
        externalId: dedupKey,
        dedupKey,
        bookedAt: new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000),
        amount: 100 + i * 50,
        currency: "UAH",
        direction: "IN",
        description: unmatchedDescriptions[i],
        counterpartyName: `Counterparty ${i + 1}`,
      },
    });
  }

  await prisma.payment.upsert({
    where: { id: "seed-payment-cash-1" },
    update: { amount: 100, paidAt: new Date(), status: "COMPLETED" },
    create: {
      id: "seed-payment-cash-1",
      orderId: order.id,
      sourceType: "CASH",
      amount: 100,
      currency: "UAH",
      paidAt: new Date(),
      status: "COMPLETED",
    },
  });

  // Matched bank transactions (Payment linked to order)
  const matchedTx1 = await prisma.bankTransaction.upsert({
    where: {
      bankAccountId_dedupKey: { bankAccountId: bankAccount.id, dedupKey: "seed-tx-matched-1" },
    },
    update: {},
    create: {
      bankAccountId: bankAccount.id,
      externalId: "seed-tx-matched-1",
      dedupKey: "seed-tx-matched-1",
      bookedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      amount: 200,
      currency: "UAH",
      direction: "IN",
      description: "Order DEMO-0001",
      counterpartyName: "Client One",
    },
  });
  const matchedTx2 = await prisma.bankTransaction.upsert({
    where: {
      bankAccountId_dedupKey: { bankAccountId: bankAccount.id, dedupKey: "seed-tx-matched-2" },
    },
    update: {},
    create: {
      bankAccountId: bankAccount.id,
      externalId: "seed-tx-matched-2",
      dedupKey: "seed-tx-matched-2",
      bookedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      amount: 150,
      currency: "UAH",
      direction: "IN",
      description: "Payment for order 0001",
      counterpartyName: "Client Two",
    },
  });

  const existingPayment1 = await prisma.payment.findFirst({
    where: { bankTransactionId: matchedTx1.id },
  });
  if (!existingPayment1) {
    await prisma.payment.create({
      data: {
        orderId: order.id,
        sourceType: "BANK",
        amount: 200,
        currency: "UAH",
        paidAt: matchedTx1.bookedAt,
        status: "COMPLETED",
        bankTransactionId: matchedTx1.id,
      },
    });
  }
  const existingPayment2 = await prisma.payment.findFirst({
    where: { bankTransactionId: matchedTx2.id },
  });
  if (!existingPayment2) {
    await prisma.payment.create({
      data: {
        orderId: order.id,
        sourceType: "BANK",
        amount: 150,
        currency: "UAH",
        paidAt: matchedTx2.bookedAt,
        status: "COMPLETED",
        bankTransactionId: matchedTx2.id,
      },
    });
  }

  await prisma.payment.upsert({
    where: { id: "seed-payment-cash-2" },
    update: { amount: 50, paidAt: new Date(), status: "COMPLETED" },
    create: {
      id: "seed-payment-cash-2",
      orderId: order.id,
      sourceType: "CASH",
      amount: 50,
      currency: "UAH",
      paidAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      status: "COMPLETED",
    },
  });
  await prisma.payment.upsert({
    where: { id: "seed-payment-cash-3" },
    update: { amount: 75, paidAt: new Date(), status: "COMPLETED" },
    create: {
      id: "seed-payment-cash-3",
      orderId: order.id,
      sourceType: "CASH",
      amount: 75,
      currency: "UAH",
      paidAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      status: "COMPLETED",
    },
  });

  const totalPaid = 100 + 200 + 150 + 50 + 75;
  await prisma.order.update({
    where: { id: order.id },
    data: {
      paidAmount: totalPaid,
      debtAmount: Math.max(0, total - totalPaid),
    },
  });

  // =========================
  // 5) Optional: seed NP sender cache rows if env provided
  // =========================
  const senderCityRef = (process.env.NP_SENDER_CITY_REF ?? "").trim();
  const senderWarehouseRef = (process.env.NP_SENDER_WAREHOUSE_REF ?? "").trim();

  if (senderCityRef) {
    await prisma.npCity.upsert({
      where: { ref: senderCityRef },
      update: {
        description: "Дніпро (seed)",
        isActive: true,
      },
      create: {
        ref: senderCityRef,
        description: "Дніпро (seed)",
        isActive: true,
      },
    });
  }

  if (senderWarehouseRef && senderCityRef) {
    await prisma.npWarehouse.upsert({
      where: { ref: senderWarehouseRef },
      update: {
        cityRef: senderCityRef,
        cityName: "Дніпро",
        number: "75",
        description: "Відділення №75 (seed)",
        shortAddress: "м. Дніпро, Відділення №75 (seed)",
        isPostomat: false,
        isActive: true,
      },
      create: {
        ref: senderWarehouseRef,
        cityRef: senderCityRef,
        cityName: "Дніпро",
        number: "75",
        description: "Відділення №75 (seed)",
        shortAddress: "м. Дніпро, Відділення №75 (seed)",
        isPostomat: false,
        isActive: true,
      },
    });
  }

  console.log("✅ Seed done.");
  console.log("ADMIN:", adminEmail, "password:", adminPassword);
  console.log("LEAD:", "lead@ecocrm.local", "password: lead12345");
  console.log("MANAGER:", "manager@ecocrm.local", "password: manager12345");
  console.log("DEMO ORDER:", "DEMO-0001");
  console.log("TEST META LEAD: Лиды → откройте карточку «Марія Шевченко» → вкладка «Источник» (данные ФБ)");
  console.log(
    "DEMO CONTACTS:",
    contact1.firstName,
    contact1.lastName,
    "and",
    contact2.firstName,
    contact2.lastName,
  );
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
