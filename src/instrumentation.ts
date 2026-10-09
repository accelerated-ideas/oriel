import type { Instrumentation } from "next";

// Errors nothing else caught, in pages, route handlers (webhooks, crons, the
// widget), server actions and the proxy, go to Telegram (src/lib/notify.ts).
// They name the route's file, never the address, whose query can carry an
// email. Next's own control flow (redirects, not found) isn't an error.
const CONTROL_FLOW = /^(NEXT_REDIRECT|NEXT_HTTP_ERROR_FALLBACK|NEXT_NOT_FOUND|DYNAMIC_SERVER_USAGE|BAILOUT_TO_CLIENT_SIDE_RENDERING)/;

export const onRequestError: Instrumentation.onRequestError = async (error, _request, context) => {
  const digest = typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : "";
  if (CONTROL_FLOW.test(digest)) return;
  const { describeError, notify } = await import("@/lib/notify");
  await notify(
    `💥 Uncaught error in ${context.routeType} ${context.routePath}${digest ? ` (digest ${digest})` : ""}\n\n${describeError(error)}`,
  );
};
