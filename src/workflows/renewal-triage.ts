export interface RenewalAnalysis {
  currency: string;
  newAmount: number | null;
  previousAmount: number | null;
  percentChange: number | null;
  recommendation: string;
}

/**
 * Deterministic renewal/bill comparator. Extracts current vs previous price
 * from sanitised notice text and produces a safe recommendation without spending money.
 */
export function analyzeRenewalNotice(cleanText: string): RenewalAnalysis {
  const currencyMatch = cleanText.match(/\b(EUR|USD|GBP)\b|([€$£])/i);
  const symbolMap: Record<string, string> = { "€": "EUR", "$": "USD", "£": "GBP" };
  const currency = currencyMatch
    ? (currencyMatch[1]?.toUpperCase() || symbolMap[currencyMatch[2]] || "EUR")
    : "EUR";

  const amounts = [...cleanText.matchAll(/(?:EUR|USD|GBP|[€$£])\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*(?:EUR|USD|GBP|euros?|dollars?|pounds?)/gi)]
    .map((m) => Number(m[1] || m[2]))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (amounts.length === 0) {
    return {
      currency,
      newAmount: null,
      previousAmount: null,
      percentChange: null,
      recommendation: "Could not verify exact price in notice; no payment or external action taken.",
    };
  }

  if (amounts.length === 1) {
    return {
      currency,
      newAmount: amounts[0],
      previousAmount: null,
      percentChange: null,
      recommendation: `Detected ${currency} ${amounts[0].toFixed(2)} renewal quote. No prior baseline found to compare; awaiting your approval before contacting provider.`,
    };
  }

  // Assume first is previous or smaller baseline if phrased "from X to Y", else compare last two
  const fromTo = cleanText.match(/from\s+(?:EUR|USD|GBP|[€$£])?\s*(\d+(?:\.\d{1,2})?)\s+to\s+(?:EUR|USD|GBP|[€$£])?\s*(\d+(?:\.\d{1,2})?)/i);
  const previousAmount = fromTo ? Number(fromTo[1]) : amounts[0];
  const newAmount = fromTo ? Number(fromTo[2]) : amounts[1];
  const percentChange = Number((((newAmount - previousAmount) / previousAmount) * 100).toFixed(1));

  const recommendation =
    percentChange > 5
      ? `Price increased by +${percentChange}% (${currency} ${previousAmount.toFixed(2)} -> ${newAmount.toFixed(2)}). Recommend switching or negotiating; payment is hard-blocked in code.`
      : `Price change is ${percentChange >= 0 ? "+" : ""}${percentChange}% (${currency} ${previousAmount.toFixed(2)} -> ${newAmount.toFixed(2)}). Within normal range.`;

  return { currency, newAmount, previousAmount, percentChange, recommendation };
}
