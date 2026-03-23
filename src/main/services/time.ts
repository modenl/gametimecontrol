export const WEEKLY_QUOTA_SECONDS = 2 * 60 * 60;
export const SESSION_MAX_SECONDS = 40 * 60;
export const MIN_GAP_SECONDS = 4 * 60 * 60;

export function getWeekStartLocal(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  const day = copy.getDay();
  const distanceToMonday = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + distanceToMonday);
  return copy;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function secondsBetween(startIso: string, endIso: string): number {
  return Math.max(0, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000));
}
