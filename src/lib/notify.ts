import "server-only";
import { BRAND } from "@/config/brand";

// Important events go to a Telegram chat (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID):
// sign-ups, subscriptions, and errors in server actions, webhooks, crons and
// pages. Messages say what happened with ids only, never people's details:
// emails and keys are scrubbed from everything that goes out. Without the two
// variables nothing is sent.

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SECRET = /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]+|\bwhsec_[A-Za-z0-9]+|\bre_[A-Za-z0-9_]{16,}|\bBearer\s+[A-Za-z0-9._~+/-]+=*/g;

export function scrub(text: string) {
  return text.replace(EMAIL, "[email]").replace(SECRET, "[secret]");
}

// Where a message comes from: production, a preview deployment, or a local copy.
function environmentLabel() {
  if (process.env.VERCEL_ENV === "production") return "";
  return process.env.VERCEL_ENV === "preview" ? "[PREVIEW] " : "[DEV] ";
}

export async function notify(message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: scrub(`${environmentLabel()}🎙️ ${BRAND.name.toUpperCase()}: ${message}`).slice(0, 3500),
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) console.error("Telegram notification failed", response.status);
  } catch (error) {
    console.error("Telegram notification failed", error);
  }
}

// What went wrong, in a few lines: the error's name, code and message, and
// where in the code it was thrown.
export function describeError(error: unknown) {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    const frames = (error.stack ?? "")
      .split("\n")
      .slice(1, 4)
      .map((line) => line.trim())
      .join("\n");
    return `${error.name}${code ? ` (${code})` : ""}: ${error.message}`.slice(0, 600) + (frames ? `\n${frames}` : "");
  }
  // Supabase returns plain objects. Their `details` can hold row values, so
  // only the code and message go out.
  if (error && typeof error === "object") {
    const { code, message } = error as { code?: unknown; message?: unknown };
    if (message) return `${code ? `${code}: ` : ""}${String(message)}`.slice(0, 600);
  }
  return String(error).slice(0, 600);
}

// Validation errors are the visitor's or the form's, not the app's.
function expected(error: unknown) {
  return error instanceof Error && error.name === "ZodError";
}

type Ids = Record<string, string | number | null | undefined>;

function idList(ids?: Ids) {
  const parts = Object.entries(ids ?? {})
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key} ${String(value).slice(0, 64)}`);
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

// An unexpected error that was caught: logged, and sent with where it happened.
export async function reportError(where: string, error: unknown, ids?: Ids) {
  console.error(where, error);
  if (expected(error)) return;
  await notify(`⚠️ Error in ${where}${idList(ids)}\n\n${describeError(error)}`);
}

// Something important that isn't an error: a sign-up, a subscription.
export async function notifyEvent(message: string, ids?: Ids) {
  await notify(`${message}${idList(ids)}`);
}
