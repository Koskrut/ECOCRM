export function shouldHaltShrink(previous: number | null, next: number, force: boolean): boolean {
  if (force) return false;
  if (previous == null || previous <= 0) return false;
  return next * 2 < previous;
}

export type AudiencePerson = {
  phone: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  city: string | null;
};

export type DedupedAudience = {
  people: AudiencePerson[];
  skippedNoContact: number;
};

/** Collapse the same phone or email. People with neither are counted and dropped. */
export function dedupeAudience(people: AudiencePerson[]): DedupedAudience {
  const seen = new Set<string>();
  const kept: AudiencePerson[] = [];
  let skippedNoContact = 0;
  for (const person of people) {
    const phone = (person.phone ?? "").replace(/\D/g, "");
    const email = (person.email ?? "").trim().toLowerCase();
    if (!phone && !email) {
      skippedNoContact += 1;
      continue;
    }
    const key = phone ? `p:${phone}` : `e:${email}`;
    if (seen.has(key)) continue;
    if (email) seen.add(`e:${email}`);
    if (phone) seen.add(`p:${phone}`);
    kept.push({
      phone: phone || null,
      email: email || null,
      firstName: person.firstName,
      lastName: person.lastName,
      city: person.city,
    });
  }
  return { people: kept, skippedNoContact };
}
