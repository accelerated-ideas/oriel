import "server-only";
import { assertPublicUrl } from "@/lib/actions/ssrf";
import { callProvider, ProviderError, type Connection } from "../store";
import { addDays, clampDays, pickSlots, slotLabel, startDate, zoneOrDefault } from "./time";
import { accessToken, secretFrom, type TokenResponse } from "./tokens";
import type { Connected, ProviderAdapter } from "./types";

// Cal.com (API v2). Two ways to connect:
// - "Connect with Cal.com": our OAuth client (CALCOM_CLIENT_ID and
//   CALCOM_CLIENT_SECRET, created at app.cal.com/settings/developer/oauth and
//   approved by Cal.com). Access tokens last 30 minutes and are refreshed.
// - An API key the customer pastes, which is also how self-hosted Cal.com
//   connects (with the address of its API).
// Each endpoint wants its own `cal-api-version`; a wrong one silently gets an
// older schema.
//   event types  2026-06-12    slots  2024-09-04    bookings  2026-02-25

const CLOUD_API = "https://api.cal.com/v2";
const SCOPES = ["PROFILE_READ", "EVENT_TYPE_READ", "BOOKING_READ", "BOOKING_WRITE"];
const VERSIONS = { eventTypes: "2026-06-12", slots: "2024-09-04", bookings: "2026-02-25" } as const;

type EventType = { id: number; title: string; lengthInMinutes: number; bookingUrl?: string; hidden?: boolean };

async function cal<T>(base: string, bearer: string, path: string, version?: string, init: RequestInit = {}) {
  return callProvider<{ status: string; data: T }>(`${base}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${bearer}`,
      "content-type": "application/json",
      ...(version && { "cal-api-version": version }),
      ...init.headers,
    },
  });
}

async function tokenRequest(params: Record<string, string>) {
  return callProvider<TokenResponse>(`${CLOUD_API}/auth/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: process.env.CALCOM_CLIENT_ID, client_secret: process.env.CALCOM_CLIENT_SECRET, ...params }),
  });
}

// The pasted API key, or a fresh OAuth access token.
function bearerFor(connection: Connection) {
  if (connection.secret.via !== "oauth") return Promise.resolve(String(connection.secret.api_key));
  return accessToken(connection, (refreshToken) => tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }));
}

const call = async <T>(connection: Connection, path: string, version?: string, init?: RequestInit) =>
  cal<T>(String(connection.metadata.base), await bearerFor(connection), path, version, init);

async function eventTypes(base: string, bearer: string, username: string) {
  const result = await cal<EventType[]>(base, bearer, `/event-types?username=${encodeURIComponent(username)}`, VERSIONS.eventTypes);
  return result.data.filter((type) => !type.hidden);
}

async function chosenEventType(connection: Connection) {
  const types = await eventTypes(String(connection.metadata.base), await bearerFor(connection), String(connection.metadata.username));
  const id = Number(connection.config.event_type);
  const type = types.find((candidate) => candidate.id === id) ?? types[0];
  if (!type) throw new Error("There's no event type to book in Cal.com.");
  return type;
}

// Open start times (ISO) for an event type, from `from` (a day) for `days` days.
async function openTimes(connection: Connection, type: EventType, zone: string, from: string, days: number) {
  const query = new URLSearchParams({ eventTypeId: String(type.id), start: from, end: addDays(from, days), timeZone: zone, format: "range" });
  const result = await call<Record<string, { start: string }[]>>(connection, `/slots?${query}`, VERSIONS.slots);
  return Object.values(result.data)
    .flat()
    .map((slot) => slot.start);
}

// Where people use the Cal.com app: the cloud's, or a self-hosted one's address without /api/v2.
function appUrlOf(base: string) {
  if (base === CLOUD_API) return "https://app.cal.com";
  return /\/api\/v2$/.test(base) ? base.replace(/\/api\/v2$/, "") : undefined;
}

// Who connected and the meeting to start with, whichever way they connected.
async function connectedWith(base: string, bearer: string, secret: Connection["secret"]): Promise<Connected> {
  const me = await cal<{ username: string; email: string; timeZone?: string }>(base, bearer, "/me").catch((error) => {
    throw new Error(error instanceof ProviderError && error.status === 401 ? "Cal.com didn't accept that API key." : error.message);
  });
  const types = await eventTypes(base, bearer, me.data.username);
  return {
    secret,
    metadata: { account_name: me.data.email, username: me.data.username, time_zone: me.data.timeZone, base, app_url: appUrlOf(base) },
    config: types[0] ? { event_type: String(types[0].id), event_type_label: `${types[0].title} (${types[0].lengthInMinutes} min)` } : {},
  };
}

// Their booking page with name, email and notes filled in, for when booking
// here isn't possible.
function bookingLink(type: EventType, name: string | null, email: string | null, notes: string | null) {
  if (!type.bookingUrl) return null;
  const url = new URL(type.bookingUrl);
  if (name) url.searchParams.set("name", name);
  if (email) url.searchParams.set("email", email);
  if (notes) url.searchParams.set("notes", notes);
  return url.toString();
}

export const calcomAdapter: ProviderAdapter = {
  id: "calcom",
  oauthConfigured: () => Boolean(process.env.CALCOM_CLIENT_ID && process.env.CALCOM_CLIENT_SECRET),

  authorizeUrl(state, redirectUri) {
    const url = new URL("https://app.cal.com/auth/oauth2/authorize");
    url.searchParams.set("client_id", process.env.CALCOM_CLIENT_ID!);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", SCOPES.join(" "));
    url.searchParams.set("state", state);
    return url.toString();
  },

  async exchangeCode(code, redirectUri) {
    const token = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
    return connectedWith(CLOUD_API, token.access_token, { ...secretFrom(token), via: "oauth" });
  },

  async connectWithToken(values) {
    const apiKey = (values.api_key ?? "").trim();
    if (!apiKey) throw new Error("Paste your Cal.com API key.");
    let base = CLOUD_API;
    if (values.api_url?.trim()) {
      base = values.api_url.trim().replace(/\/+$/, "");
      if (!/^https:\/\//.test(base)) throw new Error("The API address must start with https://.");
      await assertPublicUrl(base);
    }
    const connected = await connectedWith(base, apiKey, { api_key: apiKey, via: "key" });
    return { ...connected, metadata: { ...connected.metadata, key_hint: apiKey.slice(-4) } };
  },

  async settings(connection) {
    const types = await eventTypes(String(connection.metadata.base), await bearerFor(connection), String(connection.metadata.username));
    return [
      {
        key: "event_type",
        label: "Meeting to book",
        options: types.map((type) => ({ value: String(type.id), label: `${type.title} (${type.lengthInMinutes} min)` })),
      },
    ];
  },

  async run(capability, context) {
    const { connection, input, user } = context;
    const zone = zoneOrDefault(user.timeZone, connection.metadata.time_zone as string);
    const type = await chosenEventType(connection);

    if (capability === "find_meeting_times") {
      const from = startDate(input.from_date, zone);
      const slots = pickSlots(await openTimes(connection, type, zone, from, clampDays(input.days)), zone);
      if (slots.length === 0)
        return { meeting: type.title, time_zone: zone, slots: [], note: "No open times then. Offer to look further ahead." };
      return { meeting: `${type.title} (${type.lengthInMinutes} min)`, time_zone: zone, slots };
    }

    if (capability === "book_meeting") {
      const name = user.name;
      const notes = typeof input.notes === "string" && input.notes.trim() ? input.notes.trim() : null;
      if (!name || !user.email) return { error: "Ask for their name and email first." };
      const start = new Date(String(input.start_time ?? ""));
      if (Number.isNaN(start.getTime())) return { error: "Use a start_time exactly as find_meeting_times returned it." };
      try {
        const booking = await call<{ uid: string; status: string; start: string }>(connection, "/bookings", VERSIONS.bookings, {
          method: "POST",
          body: JSON.stringify({
            start: start.toISOString(),
            eventTypeId: type.id,
            attendee: { name, email: user.email, timeZone: zone, language: "en" },
            ...(notes && { bookingFieldsResponses: { notes } }),
            metadata: { source: "ai_assistant", conversation_id: context.conversation.id },
          }),
        });
        const when = slotLabel(booking.data.start, zone);
        return booking.data.status === "pending"
          ? {
              booked: true,
              pending: true,
              when,
              note: `Requested for ${when}. The host confirms it, and ${user.email} gets an email either way.`,
            }
          : { booked: true, when, note: `Booked for ${when}. A calendar invitation is on its way to ${user.email}.` };
      } catch (error) {
        const link = bookingLink(type, name, user.email, notes);
        return {
          booked: false,
          error: `Cal.com couldn't book it: ${(error as Error).message}`,
          ...(link && { booking_link: link, note: "Offer to open the booking page (navigate to booking_link) so they can finish there." }),
        };
      }
    }

    throw new Error(`Cal.com can't ${capability}.`);
  },

  // Refresh tokens of unknown lifetime: refreshed now and then while unused (../keep-alive.ts).
  async keepAlive(connection) {
    if (connection.secret.via !== "oauth") return;
    connection.secret = { ...connection.secret, expires_at: 1 };
    await call(connection, "/me");
  },

  // Looks up open times for the chosen meeting, without booking anything.
  async test(connection) {
    const zone = zoneOrDefault(null, connection.metadata.time_zone as string);
    const type = await chosenEventType(connection);
    const [first] = await openTimes(connection, type, zone, startDate(undefined, zone), 7);
    return {
      note: first ? `${type.title}: next open time ${slotLabel(first, zone)}` : `${type.title} has no open times in the next 7 days`,
      url: type.bookingUrl,
    };
  },
};
