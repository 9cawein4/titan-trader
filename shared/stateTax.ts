/** US tax residency metadata for planning estimates only (not tax advice). */

export type StateResidencyInfo = { code: string; name: string; defaultShortTermRate: number; defaultLongTermRate: number; basis: string; };

export const STATE_RESIDENCY_LIST: StateResidencyInfo[] = [
  { code: "AL", name: "Alabama", defaultShortTermRate: 0.05, defaultLongTermRate: 0.05, basis: "Capital gains generally taxed as ordinary income (approx. top bracket)." },
  { code: "AK", name: "Alaska", defaultShortTermRate: 0, defaultLongTermRate: 0, basis: "No state individual income tax." },
  { code: "AZ", name: "Arizona", defaultShortTermRate: 0.025, defaultLongTermRate: 0.025, basis: "Flat tax regime (verify year-specific rate)." },
  { code: "AR", name: "Arkansas", defaultShortTermRate: 0.047, defaultLongTermRate: 0.047, basis: "Capital gains generally taxed as ordinary income (approx. top bracket)." },
  { code: "CA", name: "California", defaultShortTermRate: 0.133, defaultLongTermRate: 0.133, basis: "Approx. top marginal rate on ordinary income for high earners (verify bracket)." },
  { code: "CO", name: "Colorado", defaultShortTermRate: 0.044, defaultLongTermRate: 0.044, basis: "Flat rate on taxable income including capital gains." },
  { code: "CT", name: "Connecticut", defaultShortTermRate: 0.0699, defaultLongTermRate: 0.0699, basis: "Capital gains generally taxed as ordinary income (approx. top bracket)." },
  { code: "DE", name: "Delaware", defaultShortTermRate: 0.066, defaultLongTermRate: 0.066, basis: "Capital gains generally taxed as ordinary income (approx. top bracket)." },
  { code: "DC", name: "District of Columbia", defaultShortTermRate: 0.1075, defaultLongTermRate: 0.1075, basis: "Capital gains generally taxed as ordinary income (approx. top bracket)." },
  { code: "FL", name: "Florida", defaultShortTermRate: 0, defaultLongTermRate: 0, basis: "No state individual income tax." },
  { code: "GA", name: "Georgia", defaultShortTermRate: 0.0575, defaultLongTermRate: 0.0575, basis: "Capital gains generally taxed as ordinary income (approx. top bracket)." },
  { code: "HI", name: "Hawaii", defaultShortTermRate: 0.11, defaultLongTermRate: 0.11, basis: "Capital gains generally taxed as ordinary income (approx. top bracket)." },
  { code: "ID", name: "Idaho", defaultShortTermRate: 0.058, defaultLongTermRate: 0.058, basis: "Capital gains generally taxed as ordinary income (approx. top bracket)." },
  { code: "IL", name: "Illinois", defaultShortTermRate: 0.0495, defaultLongTermRate: 0.0495, basis: "Flat rate on taxable income." },
  { code: "IN", name: "Indiana", defaultShortTermRate: 0.0315, defaultLongTermRate: 0.0315, basis: "Flat rate on taxable income." },
  { code: "IA", name: "Iowa", defaultShortTermRate: 0.06, defaultLongTermRate: 0.06, basis: "Capital gains generally taxed as ordinary income (approx. top bracket)." },
  { code: "KS", name: "Kansas", defaultShortTermRate: 0.057, defaultLongTermRate: 0.057, basis: "Capital gains generally taxed as ordinary income (approx. top bracket)." },
  { code: "KY", name: "Kentucky", defaultShortTermRate: 0.045, defaultLongTermRate: 0.045, basis: "Flat rate on taxable income." },
  { code: "LA", name: "Louisiana", defaultShortTermRate: 0.0425, defaultLongTermRate: 0.0425, basis: "Capital gains generally taxed as ordinary income (approx. top bracket)." },
  { code: "ME", name: "Maine", defaultShortTermRate: 0.0715, defaultLongTermRate: 0.0715, basis: "Capital gains generally taxed as ordinary income (approx. top bracket)." },
  { code: "MD", name: "Maryland", defaultShortTermRate: 0.0575, defaultLongTermRate: 0.0575, basis: "State rate only; counties may impose local income tax." },
  { code: "MA", name: "Massachusetts", defaultShortTermRate: 0.09, defaultLongTermRate: 0.09, basis: "Verify MA sourcing rules for short-term vs. long-term gains." },
  { code: "MI", name: "Michigan", defaultShortTermRate: 0.0425, defaultLongTermRate: 0.0425, basis: "Flat rate on taxable income." },
  { code: "MN", name: "Minnesota", defaultShortTermRate: 0.0985, defaultLongTermRate: 0.0985, basis: "Capital gains generally taxed as ordinary income (approx. top bracket)." },
  { code: "MS", name: "Mississippi", defaultShortTermRate: 0.05, defaultLongTermRate: 0.05, basis: "Capital gains generally taxed as ordinary income (approx. top bracket)." },
  { code: "MO", name: "Missouri", defaultShortTermRate: 0.0495, defaultLongTermRate: 0.0495, basis: "Capital gains generally taxed as ordinary income (approx. top bracket)." },
  { code: "MT", name: "Montana", defaultShortTermRate: 0.0675, defaultLongTermRate: 0.0675, basis: "Capital gains generally taxed as ordinary income (approx. top bracket)." },
  { code: "NE", name: "Nebraska", defaultShortTermRate: 0.0684, defaultLongTermRate: 0.0684, basis: "Capital gains generally taxed as ordinary income (approx. top bracket)." },
  { code: "NV", name: "Nevada", defaultShortTermRate: 0, defaultLongTermRate: 0, basis: "No state individual income tax." },
  { code: "NH", name: "New Hampshire", defaultShortTermRate: 0, defaultLongTermRate: 0, basis: "No broad tax on wages/capital gains at state level (verify investment income rules)." },
  { code: "NJ", name: "New Jersey", defaultShortTermRate: 0.1075, defaultLongTermRate: 0.1075, basis: "Capital gains generally taxed as ordinary income (approx. top bracket)." },
  { code: "NM", name: "New Mexico", defaultShortTermRate: 0.059, defaultLongTermRate: 0.059, basis: "Capital gains generally taxed as ordinary income (approx. top bracket)." },
  { code: "NY", name: "New York", defaultShortTermRate: 0.109, defaultLongTermRate: 0.109, basis: "NY State top rate; NYC/Yonkers residents may owe additional local tax." },
  { code: "NC", name: "North Carolina", defaultShortTermRate: 0.0475, defaultLongTermRate: 0.0475, basis: "Flat rate on taxable income." },
  { code: "ND", name: "North Dakota", defaultShortTermRate: 0.029, defaultLongTermRate: 0.029, basis: "Capital gains generally taxed as ordinary income (approx. top bracket)." },
  { code: "OH", name: "Ohio", defaultShortTermRate: 0.0399, defaultLongTermRate: 0.0399, basis: "Capital gains generally taxed as ordinary income (approx. top bracket)." },
  { code: "OK", name: "Oklahoma", defaultShortTermRate: 0.0475, defaultLongTermRate: 0.0475, basis: "Capital gains generally taxed as ordinary income (approx. top bracket)." },
  { code: "OR", name: "Oregon", defaultShortTermRate: 0.099, defaultLongTermRate: 0.099, basis: "Capital gains generally taxed as ordinary income (approx. top bracket)." },
  { code: "PA", name: "Pennsylvania", defaultShortTermRate: 0.0307, defaultLongTermRate: 0.0307, basis: "Flat personal income tax rate." },
  { code: "RI", name: "Rhode Island", defaultShortTermRate: 0.0599, defaultLongTermRate: 0.0599, basis: "Capital gains generally taxed as ordinary income (approx. top bracket)." },
  { code: "SC", name: "South Carolina", defaultShortTermRate: 0.065, defaultLongTermRate: 0.065, basis: "Capital gains generally taxed as ordinary income (approx. top bracket)." },
  { code: "SD", name: "South Dakota", defaultShortTermRate: 0, defaultLongTermRate: 0, basis: "No state individual income tax." },
  { code: "TN", name: "Tennessee", defaultShortTermRate: 0, defaultLongTermRate: 0, basis: "No state individual income tax." },
  { code: "TX", name: "Texas", defaultShortTermRate: 0, defaultLongTermRate: 0, basis: "No state individual income tax." },
  { code: "UT", name: "Utah", defaultShortTermRate: 0.0465, defaultLongTermRate: 0.0465, basis: "Flat rate on taxable income." },
  { code: "VT", name: "Vermont", defaultShortTermRate: 0.0875, defaultLongTermRate: 0.0875, basis: "Capital gains generally taxed as ordinary income (approx. top bracket)." },
  { code: "VA", name: "Virginia", defaultShortTermRate: 0.0575, defaultLongTermRate: 0.0575, basis: "Capital gains generally taxed as ordinary income (approx. top bracket)." },
  { code: "WA", name: "Washington", defaultShortTermRate: 0, defaultLongTermRate: 0.07, basis: "No traditional income tax; long-term gains may face WA capital gains excise (exemptions/thresholds apply)." },
  { code: "WV", name: "West Virginia", defaultShortTermRate: 0.0565, defaultLongTermRate: 0.0565, basis: "Capital gains generally taxed as ordinary income (approx. top bracket)." },
  { code: "WI", name: "Wisconsin", defaultShortTermRate: 0.0765, defaultLongTermRate: 0.0765, basis: "Capital gains generally taxed as ordinary income (approx. top bracket)." },
  { code: "WY", name: "Wyoming", defaultShortTermRate: 0, defaultLongTermRate: 0, basis: "No state individual income tax." },
];

const BY_CODE = new Map(STATE_RESIDENCY_LIST.map((s) => [s.code, s]));

export function getResidencyStateInfo(code: string | null | undefined): StateResidencyInfo | undefined {
  if (!code || code.length !== 2) return undefined;
  return BY_CODE.get(code.toUpperCase());
}

export function normalizeStateCode(code: string | null | undefined): string {
  if (!code || typeof code !== "string") return "";
  const u = code.trim().toUpperCase();
  return u.length === 2 && BY_CODE.has(u) ? u : "";
}
