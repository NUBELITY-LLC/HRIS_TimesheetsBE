import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';
import type { Database } from '../types/database.types.js';
import { auditHeaders } from '../utils/auditContext.js';

function fetchWithAudit(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const extra = auditHeaders();
  if (!Object.keys(extra).length) return fetch(input, init);

  const headers = new Headers(init?.headers);
  for (const [name, value] of Object.entries(extra)) headers.set(name, value);

  return fetch(input, { ...init, headers });
}

export const supabase: SupabaseClient<Database> = createClient<Database>(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    db: { schema: 'public' },
    global: { fetch: fetchWithAudit },
  },
);
