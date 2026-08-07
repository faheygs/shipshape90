import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Database } from "@shipshape/api";
import { createClient } from "@supabase/supabase-js";
import "react-native-url-polyfill/auto";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabase = url && publishableKey
  ? createClient<Database>(url, publishableKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;
