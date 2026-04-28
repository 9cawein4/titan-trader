import type { OptionSnapshot } from "../alpaca";

/** Iron condor — IV, credit width, max loss vs risk caps before multi-leg entry. */

export function describeIronCondorPlaceholder(): string {
  return "Iron condor: multi-leg short vol when width, credit, implied vol, and margin pass risk caps.";
}

/** Minimum implied vol on a reference leg (indicative if not on OPRA). */
export function ironCondorIvEntryOk(snap: OptionSnapshot | null, minIv: number): boolean {
  const iv = snap?.impliedVolatility;
  if (iv == null || !Number.isFinite(iv)) return false;
  return iv >= minIv;
}

export function condorEligible(shortPutIv: number | null, shortCallIv: number | null, floor: number): boolean {
  if (shortPutIv == null || shortCallIv == null) return false;
  return shortPutIv >= floor && shortCallIv >= floor;
}
