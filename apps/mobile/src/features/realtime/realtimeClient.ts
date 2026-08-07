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
  await channel.subscribe(listener);
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

export function closeRealtimeConnection() {
  client?.close();
  client = null;
}
