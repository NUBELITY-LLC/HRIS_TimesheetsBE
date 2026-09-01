import type { Request, Response } from 'express';
import { supabase } from '../../config/supabase.js';
import { env } from '../../config/env.js';
import { ok } from '../../utils/httpResponse.js';

const startedAt = Date.now();

export function live(_req: Request, res: Response): void {
  ok(res, {
    status: 'ok',
    environment: env.NODE_ENV,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
  });
}

export async function ready(_req: Request, res: Response): Promise<void> {
  const supabase = await checkSupabase();
  const status = supabase.status === 'up' ? 'ok' : 'degraded';

  res.status(status === 'ok' ? 200 : 503).json({
    data: {
      status,
      timestamp: new Date().toISOString(),
      dependencies: { supabase },
    },
  });
}

async function checkSupabase(): Promise<{ status: 'up' | 'down'; message?: string }> {
  try {
    const { error } = await supabase.from('ROLES').select('id', { head: true, count: 'exact' });
    if (error) return { status: 'down', message: error.message };
    return { status: 'up' };
  } catch (error) {
    return {
      status: 'down',
      message: error instanceof Error ? error.message : 'Error desconocido',
    };
  }
}
