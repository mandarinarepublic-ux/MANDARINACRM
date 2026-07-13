// app/api/admin/backfill/route.js
// RUTA TEMPORAL de migración. Corre el backfill Sheets → Supabase DENTRO del
// runtime de Vercel (donde los secretos GOOGLE_* / SUPABASE_* sí están disponibles).
//
// ⚠️ BORRAR esta ruta (y quizá lib/backfill.js) cuando el backfill esté validado.
//
// Uso (desde el navegador):
//   DRY-RUN (default, NO escribe):  /api/admin/backfill?key=TOKEN
//   ESCRIBIR de verdad:             /api/admin/backfill?key=TOKEN&dry=0
//   Solo algunas tablas:            /api/admin/backfill?key=TOKEN&only=usuarios,clientes
//
// Gate: token embebido (temporal; la DB destino está vacía y el backfill es
// idempotente por upsert, así que el riesgo es mínimo). Se elimina con la ruta.

import { runBackfill } from '@/lib/backfill';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // plan hobby: máx 60s. Usar ?only= si una tabla es muy grande.

const TOKEN = 'sm_bkf_Kq7Xr2Lp9Vt4Zw1Ny6Bc3Md8Hs5Jf0';

export async function GET(req) {
  const { searchParams } = new URL(req.url);

  if (searchParams.get('key') !== TOKEN) {
    return Response.json({ error: 'no autorizado' }, { status: 401 });
  }

  // Seguridad: por defecto DRY-RUN. Solo escribe con ?dry=0 explícito.
  const dryRun = searchParams.get('dry') !== '0';
  const onlyParam = searchParams.get('only');
  const only = onlyParam ? onlyParam.split(',').map((s) => s.trim()).filter(Boolean) : null;

  try {
    const result = await runBackfill({ only, dryRun });
    return Response.json(result);
  } catch (e) {
    console.error('Backfill error:', e);
    return Response.json({ error: e.message, stack: e.stack }, { status: 500 });
  }
}
