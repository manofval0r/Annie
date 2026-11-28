import { isUrlAllowed } from "../core/policy.js";
import { sanitiseExternalData } from "../core/sanitise.js";

function combineSignal(signal?: AbortSignal, timeoutMs = 8_000): AbortSignal {
  const t = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, t]) : t;
}

/**
 * Looks up concise factual summaries via keyless Wikipedia REST API.
 */
export async function lookupWikipedia(topic: string, signal?: AbortSignal): Promise<string> {
  const clean = topic.trim().replace(/\s+/g, "_").slice(0, 80);
  if (!clean) return "Tell me what topic you want me to look up.";
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(clean)}`;
  if (!isUrlAllowed(url).allowed) throw new Error("SSRF blocked Wikipedia");

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Annie-Agentware-2026/1.0" },
      signal: combineSignal(signal),
      redirect: "error",
    });
    if (!res.ok) return `Could not find a Wikipedia summary for "${topic}".`;
    const data = (await res.json()) as { title?: string; extract?: string };
    const safe = sanitiseExternalData(data.extract || "").clean.slice(0, 320);
    return safe ? `${data.title || topic}: ${safe}` : `No summary available for "${topic}".`;
  } catch (err) {
    if (signal?.aborted) throw err;
    return `Wikipedia lookup timed out for "${topic}".`;
  }
}

/**
 * Looks up grocery nutrition, allergens, and Nutri-Score via keyless OpenFoodFacts.
 */
export async function lookupGroceryProduct(query: string, signal?: AbortSignal): Promise<string> {
  const clean = query.trim().slice(0, 80);
  if (!clean) return "Give me a product name or barcode to check.";
  const isBarcode = /^\d{8,14}$/.test(clean);
  const url = isBarcode
    ? `https://world.openfoodfacts.org/api/v0/product/${clean}.json`
    : `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(clean)}&search_simple=1&action=process&json=1&page_size=2`;
  if (!isUrlAllowed(url).allowed) throw new Error("SSRF blocked OpenFoodFacts");

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Annie-Agentware-2026/1.0" },
      signal: combineSignal(signal),
      redirect: "error",
    });
    if (!res.ok) return `OpenFoodFacts returned HTTP ${res.status} for "${clean}".`;
    const data = (await res.json()) as {
      product?: { product_name?: string; nutriscore_grade?: string; allergens?: string };
      products?: Array<{ product_name?: string; nutriscore_grade?: string; allergens?: string }>;
    };
    const p = isBarcode ? data.product : data.products?.[0];
    if (!p?.product_name) return `No grocery match found for "${clean}".`;
    const name = sanitiseExternalData(p.product_name).clean.slice(0, 80);
    const grade = p.nutriscore_grade ? `Nutri-Score ${p.nutriscore_grade.toUpperCase()}` : "Nutri-Score N/A";
    const allergens = p.allergens ? `Allergens: ${sanitiseExternalData(p.allergens).clean.slice(0, 80)}` : "No allergens listed";
    return `${name} — ${grade}. ${allergens}.`;
  } catch (err) {
    if (signal?.aborted) throw err;
    return `Grocery lookup timed out for "${clean}".`;
  }
}

/**
 * Fetches live ECB exchange rates via keyless Frankfurter API.
 */
export async function fetchFxRate(from: string, to: string, signal?: AbortSignal): Promise<number | null> {
  const f = from.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
  const t = to.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
  if (f === t) return 1;
  const url = `https://api.frankfurter.app/latest?from=${f}&to=${t}`;
  if (!isUrlAllowed(url).allowed) return null;
  try {
    const res = await fetch(url, { signal: combineSignal(signal), redirect: "error" });
    if (!res.ok) return null;
    const data = (await res.json()) as { rates?: Record<string, number> };
    return typeof data.rates?.[t] === "number" ? data.rates[t] : null;
  } catch (err) {
    if (signal?.aborted) throw err;
    return null;
  }
}
