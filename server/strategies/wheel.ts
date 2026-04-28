import type { AlpacaCredentials, OptionSnapshot } from "../alpaca";
import { getOptionSnapshots } from "../alpaca";

/** Cash-secured put / wheel — extend with chain + margin rules + multi-leg opens. */
export type WheelPhase = "idle" | "csp_watch" | "csp_open" | "assigned" | "cc_open";

export function describeWheelPlaceholder(): string {
  return "Wheel: legs sync from broker; CSP/CC automation uses submitMultilegOrder when rules pass.";
}

export function suggestedWheelPhase(): WheelPhase {
  return "csp_watch";
}

/** OCC contract snapshot for sizing / IV checks before opening a CSP leg. */
export async function fetchWheelLegSnapshot(
  creds: AlpacaCredentials,
  occSymbol: string,
): Promise<OptionSnapshot | null> {
  const map = await getOptionSnapshots(creds, [occSymbol]);
  return map[occSymbol] ?? null;
}
