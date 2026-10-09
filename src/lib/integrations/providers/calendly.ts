import "server-only";
import { callProvider, ProviderError, type Connection } from "../store";
import { addDays, clampDays, pickSlots, slotLabel, startDate, startOfDayUtc, zoneOrDefault } from "./time";
import { accessToken, pkce, secretFrom, type TokenResponse } from "./tokens";
import type { Connected, ProviderAdapter } from "./types";

// Calendly (API v2). Connecting many accounts needs OAuth (with PKCE;
// refresh tokens are single-use, so each refresh replaces the stored one):
// CALENDLY_CLIENT_ID and CALENDLY_CLIENT_SECRET from an app at
// developer.calendly.com (Sandbox allows http://localhost, Production needs
// https). Without them, an account can connect with a personal access token.
//
// Booking uses the Scheduling API (POST /invitees), which needs a paid Calendly
// plan. When it can't book (free plan, required questions), the assistant gets
// a link to that exact time with the visitor's name and email filled in.

const AUTH = "https://auth.calendly.com";
const API = "https://api.calendly.com";
// Who they are; their event types and open times; booking.
const SCOPES = "users:read event_types:read scheduled_events:write";
// Locations Calendly can fill in itself; others need details from the invitee.
const AUTOMATIC_LOCATIONS = new Set([
  "zoom_conference",
  "google_conference",
  "microsoft_teams_conference",
  "webex_conference",
  "gotomeeting_conference",
  "physical",
]);

type EventType = {
  uri: string;
  name: string;
  duration: number;
  scheduling_url: string;
  active: boolean;
  locations?: { kind: string }[] | null;
  custom_questions?: { name: string; type: string; position: number; enabled: boolean; required: boolean }[];
};

function basicAuth() {
  return `Basic ${Buffer.from(`${process.env.CALENDLY_CLIENT_ID}:${process.env.CALENDLY_CLIENT_SECRET}`).toString("base64")}`;
}

async function tokenRequest(params: Record<string, string>) {
  return callProvider<TokenResponse & { owner?: string }>(`${AUTH}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", authorization: basicAuth() },
    body: new URLSearchParams(params),
  });
}

async function token(connection: Connection) {
  if (connection.secret.via !== "oauth") return String(connection.secret.access_token);
  return accessToken(connection, (refreshToken) => tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }));
}

async function calendly<T>(connection: Connection | string, path: string, init: RequestInit = {}) {
  const bearer = typeof connection === "string" ? connection : await token(connection);
  return callProvider<T>(path.startsWith("http") ? path : `${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json", ...init.headers },
  });
}

async function eventTypes(connection: Connection | string, userUri: string) {
  const query = new URLSearchParams({ user: userUri, active: "true", count: "100" });
  const result = await calendly<{ collection: EventType[] }>(connection, `/event_types?${query}`);
  return result.collection;
}

// Who connected and the meeting to start with.
async function profile(bearer: string): Promise<Pick<Connected, "metadata" | "config">> {
  const me = await calendly<{ resource: { uri: string; name: string; email: string; timezone: string } }>(bearer, "/users/me");
  const types = await eventTypes(bearer, me.resource.uri);
  return {
    metadata: { account_name: me.resource.email, user_uri: me.resource.uri, time_zone: me.resource.timezone },
    config: types[0] ? { event_type: types[0].uri, event_type_label: `${types[0].name} (${types[0].duration} min)` } : {},
  };
}

async function chosenEventType(connection: Connection) {
  const types = await eventTypes(connection, String(connection.metadata.user_uri));
  const type = types.find((candidate) => candidate.uri === connection.config.event_type) ?? types[0];
  if (!type) throw new Error("There's no active event type to book in Calendly.");
  return type;
}

// That exact time on their booking page, with name and email filled in.
function slotLink(type: EventType, start: Date, zone: string, name: string | null, email: string | null) {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(start);
  const url = new URL(`${type.scheduling_url}/${start.toISOString().replace(/\.\d{3}Z$/, "Z")}`);
  url.searchParams.set("month", date.slice(0, 7));
  url.searchParams.set("date", date);
  if (name) url.searchParams.set("name", name);
  if (email) url.searchParams.set("email", email);
  return url.toString();
}

export const calendlyAdapter: ProviderAdapter = {
  id: "calendly",
  oauthConfigured: () => Boolean(process.env.CALENDLY_CLIENT_ID && process.env.CALENDLY_CLIENT_SECRET),

  authorizeUrl(state, redirectUri) {
    const url = new URL(`${AUTH}/oauth/authorize`);
    url.searchParams.set("client_id", process.env.CALENDLY_CLIENT_ID!);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", SCOPES);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("code_challenge", pkce(state).challenge);
    url.searchParams.set("state", state);
    return url.toString();
  },

  async exchangeCode(code, redirectUri, _extra, state) {
    const result = await tokenRequest({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: pkce(state).verifier,
    });
    return { secret: { ...secretFrom(result), via: "oauth" }, ...(await profile(result.access_token)) };
  },

  async connectWithToken(values) {
    const personal = (values.access_token ?? "").trim();
    if (!personal) throw new Error("Paste a Calendly personal access token.");
    const details = await profile(personal).catch((error) => {
      throw new Error(error instanceof ProviderError && error.status === 401 ? "Calendly didn't accept that token." : error.message);
    });
    return { secret: { access_token: personal, via: "token" }, ...details };
  },

  async settings(connection) {
    const types = await eventTypes(connection, String(connection.metadata.user_uri));
    return [
      {
        key: "event_type",
        label: "Meeting to book",
        options: types.map((type) => ({ value: type.uri, label: `${type.name} (${type.duration} min)` })),
      },
    ];
  },

  async run(capability, context) {
    const { connection, input, user } = context;
    const zone = zoneOrDefault(user.timeZone, connection.metadata.time_zone as string);
    const type = await chosenEventType(connection);

    if (capability === "find_meeting_times") {
      const from = startDate(input.from_date, zone);
      // Calendly wants UTC, a start in the future, and at most 31 days.
      const start = new Date(Math.max(startOfDayUtc(from, zone).getTime(), Date.now() + 60_000));
      const end = startOfDayUtc(addDays(from, clampDays(input.days)), zone);
      const query = new URLSearchParams({ event_type: type.uri, start_time: start.toISOString(), end_time: end.toISOString() });
      const result = await calendly<{ collection: { status: string; start_time: string }[] }>(
        connection,
        `/event_type_available_times?${query}`,
      );
      const slots = pickSlots(
        result.collection.filter((slot) => slot.status === "available").map((slot) => slot.start_time),
        zone,
      );
      if (slots.length === 0)
        return { meeting: type.name, time_zone: zone, slots: [], note: "No open times then. Offer to look further ahead." };
      return { meeting: `${type.name} (${type.duration} min)`, time_zone: zone, slots };
    }

    if (capability === "book_meeting") {
      const name = user.name;
      const notes = typeof input.notes === "string" && input.notes.trim() ? input.notes.trim() : null;
      if (!name || !user.email) return { error: "Ask for their name and email first." };
      const start = new Date(String(input.start_time ?? ""));
      if (Number.isNaN(start.getTime())) return { error: "Use a start_time exactly as find_meeting_times returned it." };
      const details = await calendly<{ resource: EventType }>(connection, type.uri).then((result) => result.resource);
      const locations = details.locations ?? [];
      // Calendly needs a location when the event type has any; we can only pass one it fills in itself.
      const location = locations.find((candidate) => AUTOMATIC_LOCATIONS.has(candidate.kind));
      if (locations.length > 0 && !location) {
        return {
          booked: false,
          booking_link: slotLink(type, start, zone, name, user.email),
          note: "This meeting needs details only they can give, like a phone number. Offer to open the booking page (navigate to booking_link): the time and their details are already filled in.",
        };
      }
      const notesQuestion = details.custom_questions?.find(
        (question) => question.enabled && (question.type === "text" || question.type === "multi_line"),
      );
      try {
        const result = await calendly<{ resource: { status: string } }>(connection, "/invitees", {
          method: "POST",
          body: JSON.stringify({
            event_type: type.uri,
            start_time: start.toISOString(),
            invitee: { name, email: user.email, timezone: zone },
            ...(location && { location: { kind: location.kind } }),
            ...(notes &&
              notesQuestion && {
                questions_and_answers: [{ question: notesQuestion.name, answer: notes, position: notesQuestion.position }],
              }),
            tracking: { utm_source: "ai_assistant" },
          }),
        });
        const when = slotLabel(start.toISOString(), zone);
        return {
          booked: true,
          status: result.resource.status,
          when,
          note: `Booked for ${when}. A calendar invitation is on its way to ${user.email}.`,
        };
      } catch (error) {
        return {
          booked: false,
          error: `Calendly couldn't book it: ${(error as Error).message}`,
          booking_link: slotLink(type, start, zone, name, user.email),
          note: "Offer to open the booking page (navigate to booking_link): the time and their details are already filled in.",
        };
      }
    }

    throw new Error(`Calendly can't ${capability}.`);
  },

  // Looks up open times for the chosen meeting, without booking anything.
  async test(connection) {
    const zone = zoneOrDefault(null, connection.metadata.time_zone as string);
    const type = await chosenEventType(connection);
    const query = new URLSearchParams({
      event_type: type.uri,
      start_time: new Date(Date.now() + 60_000).toISOString(),
      end_time: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
    });
    const result = await calendly<{ collection: { status: string; start_time: string }[] }>(connection, `/event_type_available_times?${query}`);
    const first = result.collection.find((slot) => slot.status === "available");
    return {
      note: first ? `${type.name}: next open time ${slotLabel(first.start_time, zone)}` : `${type.name} has no open times in the next 7 days`,
      url: type.scheduling_url,
    };
  },

  // Refreshes tokens now and then while unused (../keep-alive.ts).
  async keepAlive(connection) {
    if (connection.secret.via !== "oauth") return;
    connection.secret = { ...connection.secret, expires_at: 1 };
    await calendly(connection, "/users/me");
  },
};
