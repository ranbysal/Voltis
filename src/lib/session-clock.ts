/**
 * Futures session clock.
 *
 * CME equity-index futures trade nearly 24h: Sun 18:00 ET through Fri 17:00 ET
 * with a daily maintenance halt 17:00–18:00 ET. Within the open week the tape
 * is conventionally split into three sessions (all times US/Eastern):
 *
 *   Asia       18:00 – 03:00
 *   London     03:00 – 09:30
 *   New York   09:30 – 17:00
 *
 * `currentFuturesSession` reports which session is on the clock right now and
 * whether the market is open, DST-safe via Intl (America/New_York).
 */

export type FuturesSession = {
  /** The session on the clock (or the next one when closed). */
  name: "Asia" | "London" | "New York";
  open: boolean;
};

const easternFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function currentFuturesSession(now: Date = new Date()): FuturesSession {
  const parts = easternFormatter.formatToParts(now);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const weekday = WEEKDAYS.indexOf(get("weekday") as (typeof WEEKDAYS)[number]);
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));

  const asia = 18 * 60; // 18:00
  const london = 3 * 60; // 03:00
  const newYork = 9 * 60 + 30; // 09:30
  const close = 17 * 60; // 17:00

  const sessionAt = (m: number): FuturesSession["name"] =>
    m >= asia || m < london ? "Asia" : m < newYork ? "London" : "New York";

  // Weekend: Fri 17:00 -> Sun 18:00 is closed (next session is Asia).
  if (
    weekday === 6 || // Saturday
    (weekday === 5 && minutes >= close) || // Friday after the close
    (weekday === 0 && minutes < asia) // Sunday before the open
  ) {
    return { name: "Asia", open: false };
  }

  // Daily maintenance halt 17:00-18:00 ET (Mon-Thu).
  if (minutes >= close && minutes < asia) {
    return { name: "Asia", open: false };
  }

  return { name: sessionAt(minutes), open: true };
}
