import "server-only";

// Dates in the visitor's time zone, for offering meeting times.

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function validZone(zone: string | null | undefined) {
  if (!zone) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
}

export function zoneOrDefault(...zones: (string | null | undefined)[]) {
  for (const zone of zones) if (validZone(zone)) return zone!;
  return "UTC";
}

// How far a zone is ahead of UTC at an instant, in ms.
function offsetAt(instant: number, zone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - instant;
}

// Midnight at the start of a local day, as a UTC instant (right across DST changes).
export function startOfDayUtc(date: string, zone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, day);
  return new Date(guess - offsetAt(guess - offsetAt(guess, zone), zone));
}

export function todayIn(zone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function addDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

// The day a visitor asked about, or today; never in the past.
export function startDate(value: unknown, zone: string) {
  const today = todayIn(zone);
  return typeof value === "string" && DATE.test(value) && value > today ? value : today;
}

export function clampDays(value: unknown, fallback = 7, max = 14) {
  const days = Math.round(Number(value));
  return Number.isFinite(days) && days >= 1 ? Math.min(days, max) : fallback;
}

export function slotLabel(start: string, zone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(start));
}

// A few times per day over the first days that have any, so the model has
// real choices without a wall of slots.
export function pickSlots(starts: string[], zone: string, perDay = 4, maxDays = 5) {
  const now = Date.now();
  const byDay = new Map<string, string[]>();
  for (const start of [...new Set(starts)].sort((a, b) => Date.parse(a) - Date.parse(b))) {
    if (Date.parse(start) <= now) continue;
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
      new Date(start),
    );
    if (!byDay.has(day) && byDay.size >= maxDays) break;
    const list = byDay.get(day) ?? [];
    if (list.length < perDay) list.push(start);
    byDay.set(day, list);
  }
  return [...byDay.values()].flat().map((start) => ({ start_time: start, label: slotLabel(start, zone) }));
}
