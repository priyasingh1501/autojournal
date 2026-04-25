/**
 * Day-rollover helper.
 *
 * Default cutoff is 00:00 (midnight) — entries bucket into the calendar date
 * they were captured on. The function still accepts a custom `rolloverHour`
 * so callers/tests can opt into late-night behavior (e.g. hour=3 makes 01:30
 * roll back to the previous day).
 *
 * Kept pure (no AsyncStorage reads) so both call sites and tests share
 * the same logic.
 */

const DEFAULT_ROLLOVER_HOUR = 0;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function calendarDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Returns the YYYY-MM-DD that this timestamp belongs to, applying a
 * rollover cutoff. Anything before `rolloverHour` (exclusive of the hour
 * itself) rolls to the previous day.
 */
export function effectiveDateStr(
  tsMs: number,
  rolloverHour: number = DEFAULT_ROLLOVER_HOUR,
): string {
  const d = new Date(tsMs);
  if (d.getHours() < rolloverHour) {
    // Shift back by one calendar day.
    const shifted = new Date(d);
    shifted.setDate(shifted.getDate() - 1);
    return calendarDateStr(shifted);
  }
  return calendarDateStr(d);
}

/**
 * Convenience: the date-string the app should treat as "today right now".
 * When the flag is off, callers should skip this and use their existing
 * calendar-based helper.
 */
export function effectiveTodayStr(rolloverHour: number = DEFAULT_ROLLOVER_HOUR): string {
  return effectiveDateStr(Date.now(), rolloverHour);
}
