import { Rest } from "npm:ably@2.26.0";
import { withSupabase } from "npm:@supabase/server@1.4.1";

export default {
  fetch: withSupabase({ auth: "user" }, async (_request, context) => {
    const userId = context.userClaims?.id;
    const ablyApiKey = Deno.env.get("ABLY_API_KEY");
    if (!userId || !ablyApiKey) return Response.json({ error: "Realtime service is not configured" }, { status: 500 });

    const { data: memberships, error: membershipError } = await context.supabase
      .from("challenge_members")
      .select("challenge_id")
      .eq("profile_id", userId)
      .eq("status", "active");
    if (membershipError) return Response.json({ error: membershipError.message }, { status: 500 });

    const capability: Record<string, string[]> = {
      [`user:${userId}:notifications`]: ["subscribe"],
    };
    for (const membership of memberships ?? []) {
      capability[`challenge:${membership.challenge_id}:*`] = ["subscribe"];
    }

    const ably = new Rest({ key: ablyApiKey });
    const tokenRequest = await ably.auth.createTokenRequest({ clientId: userId, capability: JSON.stringify(capability), ttl: 60 * 60 * 1000 });
    return Response.json(tokenRequest);
  }),
};
