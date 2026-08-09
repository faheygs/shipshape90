import { Realtime, type Message, type TokenRequest } from "ably";
import { supabase } from "../../lib/supabase";

export interface ShipShapeRealtimeEvent {
  eventId?: string;
  type: string;
  challengeId?: string;
  version?: number;
  payload: Record<string, unknown>;
}

let client: Realtime | null = null;
let authorizationRefresh: Promise<void> | null = null;

interface AblyErrorShape {
  code?: number;
  cause?: unknown;
}

function isCapabilityDenied(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as AblyErrorShape;
  return candidate.code === 40160 || isCapabilityDenied(candidate.cause);
}

function refreshAuthorization(realtime: Realtime): Promise<void> {
  if (authorizationRefresh) return authorizationRefresh;
  authorizationRefresh = realtime.auth.authorize()
    .then(() => undefined)
    .finally(() => { authorizationRefresh = null; });
  return authorizationRefresh;
}

function getClient(): Realtime | null {
  const database = supabase;
  if (!database) return null;
  if (client) return client;
  client = new Realtime({
    autoConnect: true,
    authCallback: (_params, callback) => {
      database.functions.invoke<TokenRequest>("ably-token")
        .then(({ data, error }) => callback(error?.message ?? null, data ?? null))
        .catch((error: unknown) => callback(error instanceof Error ? error.message : "Realtime authentication failed", null));
    },
  });
  return client;
}

export async function subscribeToChallenge(
  challengeId: string,
  onEvent: (event: ShipShapeRealtimeEvent) => void,
): Promise<() => void> {
  const realtime = getClient();
  if (!realtime) return () => undefined;
  const channel = realtime.channels.get(`challenge:${challengeId}:activity`);
  const listener = (message: Message) => {
    const data = (message.data ?? {}) as Record<string, unknown>;
    onEvent({
      eventId: typeof data.eventId === "string" ? data.eventId : undefined,
      type: message.name ?? "challenge.updated",
      challengeId,
      version: typeof data.version === "number" ? data.version : undefined,
      payload: data,
    });
  };
  try {
    await channel.subscribe(listener);
  } catch (error) {
    if (!isCapabilityDenied(error)) {
      channel.unsubscribe(listener);
      throw error;
    }
    try {
      // Membership can change while the notification connection is alive. Refresh
      // its token so Ably applies the newly granted challenge capability in place.
      await refreshAuthorization(realtime);
      await channel.attach();
    } catch (retryError) {
      channel.unsubscribe(listener);
      throw retryError;
    }
  }
  return () => { void channel.unsubscribe(listener); };
}

export async function subscribeToUserNotifications(
  profileId: string,
  onEvent: (event: ShipShapeRealtimeEvent) => void,
): Promise<() => void> {
  const realtime = getClient();
  if (!realtime) return () => undefined;
  const channel = realtime.channels.get(`user:${profileId}:notifications`);
  const listener = (message: Message) => {
    const data = (message.data ?? {}) as Record<string, unknown>;
    onEvent({
      eventId: typeof data.eventId === "string" ? data.eventId : undefined,
      type: message.name ?? "user.notification",
      challengeId: typeof data.challengeId === "string" ? data.challengeId : undefined,
      version: typeof data.version === "number" ? data.version : undefined,
      payload: data,
    });
  };
  await channel.subscribe(listener);
  return () => { void channel.unsubscribe(listener); };
}

export async function refreshRealtimeAuthorization(): Promise<void> {
  if (!client) return;
  await refreshAuthorization(client);
}

export function closeRealtimeConnection() {
  client?.close();
  client = null;
  authorizationRefresh = null;
}
