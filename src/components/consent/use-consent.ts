"use client";
import { useSyncExternalStore } from "react";
import { getChoice, isSettingsOpen, subscribe, type Choice } from "./consent-store";

// "pending" until the browser has been asked, so nothing optional ever loads
// during server rendering or before hydration.
export function useConsent() {
  const choice = useSyncExternalStore<Choice | "unset" | "pending">(
    subscribe,
    () => getChoice() ?? "unset",
    () => "pending",
  );
  const settingsOpen = useSyncExternalStore(subscribe, isSettingsOpen, () => false);
  return { choice, settingsOpen };
}
