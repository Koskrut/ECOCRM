import assert from "node:assert/strict";
import test from "node:test";
import { UserRole, LocationSource, VisitStatus } from "@prisma/client";
import type { AuthUser } from "../../auth/auth.types";
import { VisitsService } from "../visits.service";

function actor(id = "u1"): AuthUser {
  return { id, email: `${id}@test.local`, fullName: "Test", role: UserRole.MANAGER };
}

function createUpdateService(overrides?: {
  existing?: Record<string, unknown>;
  contact?: Record<string, unknown> | null;
  company?: Record<string, unknown> | null;
  contactAddress?: Record<string, unknown> | null;
  companyAddress?: Record<string, unknown> | null;
}) {
  const existing = {
    id: "v1",
    ownerId: "u1",
    status: VisitStatus.PLANNED_UNASSIGNED,
    contactId: "c1",
    companyId: null,
    contactAddressId: null,
    companyAddressId: null,
    activityId: null,
    startsAt: null,
    endsAt: null,
    lat: 50.46,
    lng: 30.53,
    addressText: "WOG, Київ",
    locationSource: LocationSource.GEOCODED,
    ...overrides?.existing,
  };

  const updateData: unknown[] = [];

  const prisma = {
    visit: {
      findUnique: async () => existing,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updateData.push(data);
        return { ...existing, ...data };
      },
    },
    contact: {
      findUnique: async () =>
        overrides?.contact === null
          ? null
          : {
              lat: 50.45,
              lng: 30.52,
              address: "Client office",
              ...(overrides?.contact ?? {}),
            },
    },
    company: {
      findUnique: async () =>
        overrides?.company === null
          ? null
          : {
              lat: 49.84,
              lng: 24.03,
              address: "Company HQ",
              ...(overrides?.company ?? {}),
            },
    },
    contactAddress: {
      findFirst: async () =>
        overrides?.contactAddress === null
          ? null
          : {
              id: "addr-1",
              contactId: "c1",
              city: "Київ",
              addressText: "вул. Test, 1",
              lat: 50.45,
              lng: 30.52,
              ...(overrides?.contactAddress ?? {}),
            },
    },
    companyAddress: {
      findFirst: async () =>
        overrides?.companyAddress === null
          ? null
          : {
              id: "addr-co",
              companyId: "co1",
              city: "Львів",
              addressText: "вул. Company, 2",
              lat: 49.84,
              lng: 24.03,
              ...(overrides?.companyAddress ?? {}),
            },
    },
  };

  const service = new VisitsService(
    prisma as never,
    {} as never,
    { emitAsync: async () => undefined } as never,
    {} as never,
    {} as never,
  );

  return { service, updateData, existing };
}

test("update: scheduling does not overwrite custom GEOCODED location from contact card", async () => {
  const { service, updateData } = createUpdateService();

  await service.update(
    "v1",
    {
      status: VisitStatus.SCHEDULED,
      startsAt: new Date("2026-07-11T10:00:00.000Z"),
      endsAt: new Date("2026-07-11T11:00:00.000Z"),
    },
    actor(),
  );

  const data = updateData[0] as { lat?: number; lng?: number; addressText?: string };
  assert.equal(data.lat, undefined);
  assert.equal(data.lng, undefined);
  assert.equal(data.addressText, undefined);
});

test("update: disconnect contactAddressId when null", async () => {
  const { service, updateData } = createUpdateService({
    existing: {
      contactAddressId: "addr-1",
      locationSource: LocationSource.FROM_CONTACT,
      addressText: "Київ, вул. Test, 1",
    },
  });

  await service.update(
    "v1",
    {
      contactAddressId: null,
      addressText: "Parking lot",
      lat: 50.47,
      lng: 30.54,
      locationSource: LocationSource.GEOCODED,
    },
    actor(),
  );

  const data = updateData[0] as {
    contactAddress?: { disconnect: boolean };
    addressText: string;
    locationSource: LocationSource;
  };
  assert.deepEqual(data.contactAddress, { disconnect: true });
  assert.equal(data.addressText, "Parking lot");
  assert.equal(data.locationSource, LocationSource.GEOCODED);
});

test("update: connect contactAddressId fills coords when not in body", async () => {
  const { service, updateData } = createUpdateService({
    existing: {
      lat: null,
      lng: null,
      addressText: null,
      locationSource: LocationSource.NONE,
    },
  });

  await service.update("v1", { contactAddressId: "addr-1" }, actor());

  const data = updateData[0] as {
    contactAddress?: { connect: { id: string } };
    lat: number;
    lng: number;
    addressText: string;
    locationSource: LocationSource;
  };
  assert.deepEqual(data.contactAddress, { connect: { id: "addr-1" } });
  assert.equal(data.lat, 50.45);
  assert.equal(data.lng, 30.52);
  assert.match(data.addressText, /Test/);
  assert.equal(data.locationSource, LocationSource.FROM_CONTACT);
});
