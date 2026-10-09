"use client";
import { BRAND } from "@/config/brand";

// The visitor's choice about optional cookies on the marketing site. Remembering
// the choice is strictly necessary, so it needs no consent of its own. It's kept
// with the date and the version of what we asked, and goes stale after six
// months or when the question changes, so we ask again.
export type Choice = "granted" | "denied";
type Stored = { analytics: Choice; version: number; at: number };

const KEY = `${BRAND.messagePrefix}:consent`;
// Bump when what we ask about changes (a new tool, a new purpose).
const VERSION = 1;
const MAX_AGE_MS = 182 * 24 * 60 * 60 * 1000;

const listeners = new Set<() => void>();
let settingsOpen = false;

function read(): Stored | null {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "null") as Stored | null;
    if (!stored || stored.version !== VERSION || Date.now() - stored.at > MAX_AGE_MS) return null;
    return stored.analytics === "granted" || stored.analytics === "denied" ? stored : null;
  } catch {
    return null;
  }
}

function notify() {
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changed its mind.
  const onStorage = (event: StorageEvent) => event.key === KEY && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

// The choice in effect: what they picked, "denied" if their browser sends
// Global Privacy Control and they haven't picked, or null if we should ask.
export function getChoice(): Choice | null {
  const stored = read();
  if (stored) return stored.analytics;
  const gpc = (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl;
  return gpc ? "denied" : null;
}

// Whether they picked themselves, as opposed to a privacy signal deciding.
export function hasStoredChoice() {
  return read() !== null;
}

export function setChoice(analytics: Choice) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ analytics, version: VERSION, at: Date.now() } satisfies Stored));
  } catch {
    // Storage is blocked: the choice holds for this page only.
  }
  settingsOpen = false;
  notify();
}

// "Cookie settings" in the footer brings the banner back.
export function openSettings() {
  settingsOpen = true;
  notify();
}

export function closeSettings() {
  settingsOpen = false;
  notify();
}

export function isSettingsOpen() {
  return settingsOpen;
}
