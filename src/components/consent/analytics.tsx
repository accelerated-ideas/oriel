"use client";
import { useEffect } from "react";
import Script from "next/script";
import { ANALYTICS_COOKIE_DAYS, ANALYTICS_ENABLED, GA_MEASUREMENT_ID } from "@/config/analytics";
import { useConsent } from "./use-consent";

// gtag, and the per-property switch Google Analytics checks before sending anything.
type AnalyticsWindow = { gtag?: (...args: unknown[]) => void; [disable: `ga-disable-${string}`]: boolean };

// Google Analytics, with advertising features always off.
//   Website: nothing loads until the visitor allows it. Before that no script,
//   request or cookie reaches Google.
//   Dashboard (`cookieless`): until they choose, it runs in Google's consent
//   mode with storage denied: no cookies, and Google gets cookieless pings it
//   uses to model visits. Allowing turns cookies on. "Don't allow", or a
//   Global Privacy Control signal, stops it entirely.
export function Analytics({ cookieless = false }: { cookieless?: boolean }) {
  const { choice } = useConsent();
  const granted = choice === "granted";
  const sending = granted || (cookieless && choice === "unset");

  // Choosing, or changing their mind later: switch cookies on or off, or stop
  // sending and remove the cookies.
  useEffect(() => {
    if (!ANALYTICS_ENABLED || choice === "pending") return;
    const win = window as unknown as AnalyticsWindow;
    win[`ga-disable-${GA_MEASUREMENT_ID}`] = !sending;
    win.gtag?.("consent", "update", { analytics_storage: granted ? "granted" : "denied" });
    if (!granted) removeAnalyticsCookies();
  }, [choice, granted, sending]);

  if (!ANALYTICS_ENABLED || !sending) return null;

  const id = JSON.stringify(GA_MEASUREMENT_ID);
  // How it starts on this page; later choices go through "consent update" above.
  const storage = JSON.stringify(granted ? "granted" : "denied");
  return (
    <>
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
window.gtag = function () { window.dataLayer.push(arguments); };
gtag("consent", "default", { analytics_storage: ${storage}, ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
gtag("js", new Date());
gtag("config", ${id}, { allow_google_signals: false, allow_ad_personalization_signals: false, cookie_expires: ${ANALYTICS_COOKIE_DAYS * 24 * 60 * 60} });`}
      </Script>
      <Script id="ga-tag" src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`} strategy="afterInteractive" />
    </>
  );
}

// Google Analytics keeps _ga and _ga_<id> on the site's top domain, so try the
// host and every parent domain.
function removeAnalyticsCookies() {
  const names = document.cookie
    .split(";")
    .map((cookie) => cookie.split("=")[0].trim())
    .filter((name) => name === "_ga" || name.startsWith("_ga_") || name === "_gid");
  if (!names.length) return;
  const parts = location.hostname.split(".");
  const domains = parts.map((_, index) => parts.slice(index).join(".")).filter((domain) => domain.includes("."));
  for (const name of names) {
    document.cookie = `${name}=; Max-Age=0; path=/`;
    for (const domain of domains) document.cookie = `${name}=; Max-Age=0; path=/; domain=.${domain}`;
  }
}
