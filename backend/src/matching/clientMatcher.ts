import { prisma } from '../db';
import { logger } from '../utils/logger';
import { parseDutyRate, calculateDutyImpact } from './impactCalculator';

/**
 * Returns true when a portfolio HTS code is affected by a changed HTS code.
 *
 * Matching strategy (most-specific first):
 *   1. Exact 10-digit match
 *   2. 8-digit prefix match (first 8 digits)
 *   3. 6-digit chapter/heading match (first 6 digits)
 */
export function htsCodesMatch(portfolioCode: string, changedCode: string): boolean {
  const portfolio = portfolioCode.replace(/\D/g, '');
  const changed = changedCode.replace(/\D/g, '');

  if (portfolio.length === 0 || changed.length === 0) return false;

  // Exact match
  if (portfolio === changed) return true;

  // Prefix match at 8 digits
  const prefixLen = 8;
  if (portfolio.length >= prefixLen && changed.length >= prefixLen) {
    if (portfolio.slice(0, prefixLen) === changed.slice(0, prefixLen)) return true;
  }

  // Prefix match at 6 digits (HS Chapter / Heading)
  const headingLen = 6;
  if (portfolio.length >= headingLen && changed.length >= headingLen) {
    if (portfolio.slice(0, headingLen) === changed.slice(0, headingLen)) return true;
  }

  return false;
}

/**
 * For a newly-created TariffChange, find all active clients whose HTS portfolio
 * overlaps with the change's HTS codes. Persist ClientHtsMatch records and
 * estimate duty impact where rate data is available.
 */
export async function matchClientsToChange(changeId: string): Promise<void> {
  const change = await prisma.tariffChange.findUnique({
    where: { id: changeId },
  });

  if (!change) {
    logger.error('matchClientsToChange: change not found', { changeId });
    return;
  }

  if (change.htsCodes.length === 0) {
    logger.info('matchClientsToChange: no HTS codes on change, skipping', { changeId });
    return;
  }

  const dutyBefore = parseDutyRate(change.dutyBefore as string | null);
  const dutyAfter = parseDutyRate(change.dutyAfter as string | null);

  // Load all active clients with their portfolios
  const clients = await prisma.client.findMany({
    where: { isActive: true },
    include: { htsPortfolio: true },
  });

  let matchCount = 0;

  for (const client of clients) {
    const matchedCodes: string[] = [];
    let totalImpact: number | null = 0;

    for (const portfolioEntry of client.htsPortfolio) {
      const affected = change.htsCodes.some((changedCode) =>
        htsCodesMatch(portfolioEntry.htsCode, changedCode),
      );

      if (affected) {
        matchedCodes.push(portfolioEntry.htsCode);

        if (portfolioEntry.annualValue !== null) {
          const impact = calculateDutyImpact(portfolioEntry.annualValue, dutyBefore, dutyAfter);
          if (impact !== null) {
            totalImpact = (totalImpact ?? 0) + impact;
          } else {
            totalImpact = null; // Can't compute total without all rates
          }
        }
      }
    }

    if (matchedCodes.length > 0) {
      await prisma.clientHtsMatch.create({
        data: {
          changeId,
          clientId: client.id,
          matchedHtsCodes: matchedCodes,
          estimatedDutyImpact: totalImpact ?? undefined,
        },
      });

      matchCount++;
      logger.info('Client matched to tariff change', {
        changeId,
        clientCode: client.code,
        matchedCodes,
        estimatedDutyImpact: totalImpact,
      });
    }
  }

  logger.info('matchClientsToChange complete', { changeId, matchCount });
}
