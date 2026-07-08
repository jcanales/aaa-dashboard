/**
 * Estimates the annual duty impact for a client's HTS holding given a rate change.
 *
 * @param annualValue  Annual import value in USD for the specific HTS code
 * @param dutyBefore   Previous duty rate as a decimal (e.g. 0.075 for 7.5%)
 * @param dutyAfter    New duty rate as a decimal (e.g. 0.25 for 25%)
 * @returns            Estimated annualised duty impact in USD (positive = cost increase)
 */
export function calculateDutyImpact(
  annualValue: number,
  dutyBefore: number | null,
  dutyAfter: number | null,
): number | null {
  if (dutyBefore === null || dutyAfter === null) {
    return null;
  }
  return annualValue * (dutyAfter - dutyBefore);
}

/**
 * Parse a duty rate string such as "7.5%", "25%", or "0.075" into a decimal.
 * Returns null when the string cannot be parsed.
 */
export function parseDutyRate(rateStr: string | null | undefined): number | null {
  if (!rateStr) return null;

  const trimmed = rateStr.trim();

  // Percentage notation: "7.5%" → 0.075
  const pctMatch = trimmed.match(/^([0-9]+(?:\.[0-9]+)?)\s*%$/);
  if (pctMatch) {
    return parseFloat(pctMatch[1]) / 100;
  }

  // Plain decimal notation: "0.075"
  const decimalMatch = trimmed.match(/^([0-9]*\.[0-9]+)$/);
  if (decimalMatch) {
    return parseFloat(decimalMatch[1]);
  }

  // Integer: "25" — treat as a percentage point value → 0.25
  const intMatch = trimmed.match(/^([0-9]+)$/);
  if (intMatch) {
    return parseInt(intMatch[1], 10) / 100;
  }

  return null;
}
