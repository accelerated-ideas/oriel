// A calendar month (UTC) from a "2026-10" style key, defaulting to this month.
export function monthPeriod(key?: string | null) {
  const now = new Date();
  const match = key?.match(/^(\d{4})-(\d{2})$/);
  const year = match ? Number(match[1]) : now.getUTCFullYear();
  const month = match ? Number(match[2]) - 1 : now.getUTCMonth();
  const from = new Date(Date.UTC(year, month, 1));
  const to = new Date(Date.UTC(year, month + 1, 1));
  const isCurrent = year === now.getUTCFullYear() && month === now.getUTCMonth();
  const keyOf = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  const days = Array.from({ length: Math.round((to.getTime() - from.getTime()) / 86_400_000) }, (_, index) =>
    new Date(Date.UTC(year, month, index + 1)).toISOString().slice(0, 10),
  );
  return {
    from,
    to,
    days,
    label: from.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
    previous: keyOf(new Date(Date.UTC(year, month - 1, 1))),
    next: isCurrent || from > now ? null : keyOf(to),
  };
}

export type UsageCountRow = {
  day: string;
  organization_id: string;
  agent_id: string;
  conversations: number;
  messages: number;
  voice_seconds: number;
};
