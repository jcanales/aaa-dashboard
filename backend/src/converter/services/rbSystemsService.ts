import { getRbMaxFtzNumber, lookupRbClient as lookupRbClientRaw, type RbClientMatch } from '../../db/mssql';

export type { RbClientMatch };

// RB Systems (SmartBorder) lookups now run against duties-dashboard's shared
// MSSQL pool (backend/src/db/mssql.ts) — the same MST/US214 tables the rest of
// the dashboard already queries — rather than a second, converter-only
// connection. That pool always has connection defaults configured, so this is
// effectively always "configured"; kept as a function (rather than a plain
// `true`) so call sites read the same as the original AAA-Converter code and
// so a future opt-out remains a one-line change here.
export function isRbConfigured(): boolean {
  return true;
}

export { getRbMaxFtzNumber };

// A provisional next number for the review page (numeric MAX + 1, zero-padded).
// Not a reservation — the definitive number is claimed at XML-generation time by
// ftzAllocationService.allocateFtzNumber. Returns null if RB is unreachable.
export async function getNextFtzNumber(): Promise<string | null> {
  try {
    return String((await getRbMaxFtzNumber()) + 1).padStart(8, '0');
  } catch (err) {
    console.warn('[rbSystems] next FTZ number lookup failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function lookupRbClient(input: { name?: string | null; irs?: string | null }): Promise<RbClientMatch | null> {
  try {
    return await lookupRbClientRaw(input);
  } catch (err) {
    console.warn('[rbSystems] client lookup failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
