import { withSupabase } from "npm:@supabase/server@1.4.1";

const mediaBuckets = ["avatars", "progress-photos", "evidence"] as const;

export default {
  fetch: withSupabase({ auth: "user" }, async (_request, context) => {
    const userId = context.userClaims?.id;
    if (!userId) return Response.json({ error: "Authentication required" }, { status: 401 });

    const listUserFiles = async (bucket: (typeof mediaBuckets)[number], prefix: string): Promise<string[]> => {
      const files: string[] = [];
      let offset = 0;

      while (true) {
        const { data, error } = await context.supabaseAdmin.storage.from(bucket).list(prefix, {
          limit: 1000,
          offset,
          sortBy: { column: "name", order: "asc" },
        });
        if (error) throw error;

        for (const entry of data ?? []) {
          const path = `${prefix}/${entry.name}`;
          if (entry.id === null) files.push(...await listUserFiles(bucket, path));
          else files.push(path);
        }

        if (!data || data.length < 1000) break;
        offset += data.length;
      }

      return files;
    };

    const { error: prepareError } = await context.supabase.rpc("prepare_account_deletion");
    if (prepareError) return Response.json({ error: prepareError.message }, { status: 409 });

    try {
      for (const bucket of mediaBuckets) {
        const storage = context.supabaseAdmin.storage.from(bucket);
        const paths = await listUserFiles(bucket, userId);
        for (let index = 0; index < paths.length; index += 1000) {
          const { error } = await storage.remove(paths.slice(index, index + 1000));
          if (error) throw error;
        }
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Personal media could not be removed";
      return Response.json({ error: message }, { status: 500 });
    }

    const { error: deleteError } = await context.supabaseAdmin.auth.admin.deleteUser(userId, false);
    if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });

    return Response.json({ deleted: true });
  }),
};
