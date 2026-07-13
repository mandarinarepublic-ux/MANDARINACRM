// app/api/admin/migrate/route.js
// ENDPOINT TEMPORAL de re-sincronización CRM Sheets → Supabase (backfill final
// antes del cutover). Corre DENTRO del runtime de Vercel (donde están los secretos).
//
// Gate FAIL-CLOSED por MIG_KEY (env var puesta a mano, NO en el repo).
// ⚠️ BORRAR esta ruta y la env var MIG_KEY tras validar el cutover.
//
// Uso:
//   /api/admin/migrate?key=MIG_KEY                      → backfill de todas las tablas
//   /api/admin/migrate?key=MIG_KEY&only=usuarios,clientes
//   /api/admin/migrate?key=MIG_KEY&dry=1                → dry-run (no escribe)

import { runBackfill } from '@/lib/backfill';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel hobby: 60s. Usar ?only= si una tabla es grande.

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const key = process.env.MIG_KEY;

  // FAIL-CLOSED: sin MIG_KEY o con key incorrecta → 401.
  if (!key || searchParams.get('key') !== key) {
    return Response.json({ error: 'no autorizado' }, { status: 401 });
  }

  const onlyParam = searchParams.get('only');
  const only = onlyParam ? onlyParam.split(',').map((s) => s.trim()).filter(Boolean) : null;
  const dryRun = searchParams.get('dry') === '1';

  try {
    const result = await runBackfill({ only, dryRun });
    return Response.json(result);
  } catch (e) {
    console.error('migrate error:', e);
    return Response.json({ error: e.message, stack: e.stack }, { status: 500 });
  }
}
