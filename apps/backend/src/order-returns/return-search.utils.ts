import type { Prisma } from "@prisma/client";

/** Match a contact by full name, either name part, or phone. */
export function contactSearchFilter(search: string): Prisma.ContactWhereInput {
  const phoneDigits = search.replace(/\D/g, "");
  const nameParts = search.split(/\s+/).filter(Boolean).slice(0, 3);
  return {
    OR: [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      ...(nameParts.length > 1
        ? [
            {
              AND: nameParts.map((part) => ({
                OR: [
                  { firstName: { contains: part, mode: "insensitive" as const } },
                  { lastName: { contains: part, mode: "insensitive" as const } },
                ],
              })),
            },
          ]
        : []),
      { phone: { contains: search, mode: "insensitive" } },
      ...(phoneDigits.length >= 5 ? [{ phoneNormalized: { contains: phoneDigits } }] : []),
    ],
  };
}
