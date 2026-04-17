/**
 * Day-rollover helper for ff_day_close_model.
 *
 * An entry logged at 01:30 local belongs to yesterday's day, not today's —
 * matches how humans think about late nights. The cutoff is 03:00 by default
 * (i.e. 00:00 → 02:59 rolls back to the previous calendar date).
 *
 * Kept pure (no AsyncStorage, no flag read) so both call sites and tests
 * share the same logic. Callers decide whether to apply rollover (flag on)
 * or use straight calendar date (flag off, or legacy).
 */

const DEFAULT_ROLLOVER_HOUR = 3;

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
