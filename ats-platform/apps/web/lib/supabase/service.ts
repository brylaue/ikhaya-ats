/**
 * Supabase service-role client
 * US-455: Used exclusively by super-admin server routes/pages to bypass RLS
 * and read aggregate data across all tenant agencies.
 *
 * NEVER expose this to the browser. Import only in server components or
 * API routes that have already verified the super-admin email guard.
 */

import { createClient } from "@supabase/supabase-js";

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for super-admin access"
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
