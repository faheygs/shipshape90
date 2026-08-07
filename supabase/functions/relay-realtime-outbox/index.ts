import { Rest } from "npm:ably@2.26.0";
import { withSupabase } from "npm:@supabase/server@1.4.1";

async function sendExpoPush(database: any, event: any) {
  if (!event.topic.startsWith("user:") || !event.topic.endsWith(":notifications")) return;

  const profileId = event.topic.split(":")[1];
  const [{ data: notification }, { data: devices }, { count: unreadCount }] = await Promise.all([
    database.from("notifications").select("id,title,body,action_path,challenge_id").eq("source_event_id", event.id).maybeSingle(),
    database.from("push_devices").select("id,expo_push_token").eq("profile_id", profileId).eq("enabled", true),
    database.from("notifications").select("id", { count: "exact", head: true }).eq("profile_id", profileId).is("read_at", null),
  ]);
  if (!notification || !devices?.length) return;

  for (let index = 0; index < devices.length; index += 100) {
    const batch = devices.slice(index, index + 100);
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "accept": "application/json", "content-type": "application/json" },
      body: JSON.stringify(batch.map((device: any) => ({
        to: device.expo_push_token,
        title: notification.title,
        body: notification.body,
        sound: "default",
        priority: "high",
        channelId: "challenge-updates",
        badge: unreadCount ?? 1,
        data: {
          notificationId: notification.id,
          challengeId: notification.challenge_id,
          actionPath: notification.action_path,
        },
      }))),
    });
    if (!response.ok) throw new Error(`Expo push rejected the batch with ${response.status}`);

    const tickets = (await response.json())?.data;
    if (!Array.isArray(tickets)) continue;
    await Promise.all(tickets.map((ticket: any, ticketIndex: number) => {
      if (ticket?.status !== "error" || ticket?.details?.error !== "DeviceNotRegistered") return Promise.resolve();
      return database.from("push_devices").update({ enabled: false, updated_at: new Date().toISOString() }).eq("id", batch[ticketIndex].id);
    }));
  }
}

export default {
  fetch: withSupabase({ auth: "none" }, async (request, context) => {
    const expectedSecret = Deno.env.get("OUTBOX_RELAY_SECRET");
    if (!expectedSecret || request.headers.get("x-outbox-secret") !== expectedSecret) return new Response("Unauthorized", { status: 401 });
    const ablyApiKey = Deno.env.get("ABLY_API_KEY");
    if (!ablyApiKey) return new Response("Service is not configured", { status: 500 });

    const database = context.supabaseAdmin;
    const ably = new Rest({ key: ablyApiKey });
    const { data: events, error } = await database.rpc("claim_realtime_outbox_events", { batch_size: 100 });
    if (error) return new Response(error.message, { status: 500 });

    let published = 0;
    let failed = 0;
    for (const event of events ?? []) {
      try {
        await ably.channels.get(event.topic).publish({
          id: event.id,
          name: event.event_type,
          data: { eventId: event.id, ...event.payload },
        });

        try {
          await sendExpoPush(database, event);
        } catch (pushError) {
          console.error("Push delivery failed", event.id, pushError);
        }

        const { data: completed, error: completionError } = await database.rpc("complete_realtime_outbox_event", {
          p_event_id: event.id,
          p_lease_id: event.lease_id,
        });
        if (completionError || !completed) throw completionError ?? new Error("Outbox lease could not be completed");

        published += 1;
      } catch {
        failed += 1;
        await database.rpc("release_realtime_outbox_event", {
          p_event_id: event.id,
          p_lease_id: event.lease_id,
        });
      }
    }

    return Response.json({ examined: events?.length ?? 0, published, failed }, { status: failed > 0 ? 500 : 200 });
  }),
};
