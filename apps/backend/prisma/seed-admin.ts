import "dotenv/config";
import { PrismaClient, UserRole } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const makePlainHash = (password: string) => `plain:${password}`;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@ecocrm.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "admin12345";

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      fullName: "Admin",
      role: UserRole.ADMIN,
      username: "admin",
      passwordHash: makePlainHash(adminPassword),
    },
    create: {
      email: adminEmail,
      username: "admin",
      fullName: "Admin",
      role: UserRole.ADMIN,
      passwordHash: makePlainHash(adminPassword),
    },
  });

  console.log(`Admin upserted: ${adminEmail}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
