/** Small shared helpers for the engine. */

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function round(value: number, decimals = 0): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** Severity → numeric penalty used by the Scoring agent. */
export const SEVERITY_WEIGHT: Record<string, number> = {
  low: 2,
  medium: 5,
  high: 10,
  critical: 20,
};
