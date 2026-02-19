// apps/backend/prisma/seed.ts
import "dotenv/config";
import { PrismaClient, UserRole, DeliveryMethod, PaymentMethod } from "@prisma/client";
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

  const admin = await prisma.user.upsert({
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

  const lead = await prisma.user.upsert({
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
