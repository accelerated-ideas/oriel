import type { Conversation } from "@/lib/types";

type VisitorFields = Pick<Conversation, "visitor_id" | "user_external_id" | "user_email" | "user_name" | "country">;

// The same signed-in person gets the same avatar on every device.
export function visitorSeed(visitor: Pick<Conversation, "visitor_id" | "user_external_id" | "user_email">) {
  return visitor.user_external_id || visitor.user_email || visitor.visitor_id;
}

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

export function countryName(code: string | null) {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return null;
  try {
    return regionNames.of(code.toUpperCase()) ?? null;
  } catch {
    return null;
  }
}

export function countryFlag(code: string | null) {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return null;
  return String.fromCodePoint(...[...code.toUpperCase()].map((char) => 0x1f1a5 + char.charCodeAt(0)));
}

export function visitorName(visitor: VisitorFields) {
  if (visitor.user_name) return visitor.user_name;
  if (visitor.user_email) return visitor.user_email;
  const country = countryName(visitor.country);
  return country ? `Visitor from ${country}` : "Anonymous visitor";
}

// "Chrome on macOS", plus whether it's a phone.
export function describeDevice(userAgent: string | null) {
  if (!userAgent) return null;
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /OPR\//.test(userAgent)
      ? "Opera"
      : /Firefox\//.test(userAgent)
        ? "Firefox"
        : /Chrome\//.test(userAgent)
          ? "Chrome"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : null;
  const system = /iPhone|iPad/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
      ? "Android"
      : /Mac OS X/.test(userAgent)
        ? "macOS"
        : /Windows/.test(userAgent)
          ? "Windows"
          : /Linux/.test(userAgent)
            ? "Linux"
            : null;
  if (!browser && !system) return null;
  return { label: [browser, system].filter(Boolean).join(" on "), mobile: /Mobi|iPhone|Android/.test(userAgent) };
}

// 42 → "0:42", 754 → "12:34"
export function formatCallTime(seconds: number) {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function pathOf(url: string | null) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search;
  } catch {
    return url;
  }
}

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
