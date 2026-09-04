import { prisma } from '../../db';
import { Prisma } from '@prisma/client';
import { pickFacilityApplication, pickFacilityHeader } from '../ftz214/facilityFields';

// Prisma's InputJsonValue rejects our plain Record type at the Json write
// boundary even though the runtime value is valid JSON.
const toJson = (v: Record<string, unknown>): Prisma.InputJsonValue => v as Prisma.InputJsonValue;

const FACILITY_ID = 'default';

export interface FacilityDefaults {
  applicationInfo: Record<string, unknown>;
  header: Record<string, unknown>;
}

const EMPTY: FacilityDefaults = { applicationInfo: {}, header: {} };

export async function getFacility(): Promise<FacilityDefaults> {
  const row = await prisma.facility.findUnique({ where: { id: FACILITY_ID } });
  if (!row) return EMPTY;
  return {
    applicationInfo: (row.applicationInfo as Record<string, unknown>) ?? {},
    header: (row.header as Record<string, unknown>) ?? {},
  };
}

export async function saveFacility(input: {
  applicationInfo?: Record<string, unknown>;
  header?: Record<string, unknown>;
}): Promise<FacilityDefaults> {
  const applicationInfo = pickFacilityApplication(input.applicationInfo ?? {});
  const header = pickFacilityHeader(input.header ?? {});
  const row = await prisma.facility.upsert({
    where: { id: FACILITY_ID },
    create: { id: FACILITY_ID, applicationInfo: toJson(applicationInfo), header: toJson(header) },
    update: { applicationInfo: toJson(applicationInfo), header: toJson(header) },
  });
  return {
    applicationInfo: row.applicationInfo as Record<string, unknown>,
    header: row.header as Record<string, unknown>,
  };
}
