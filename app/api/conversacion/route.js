import { getConversacion } from '@/lib/inbox-supabase';

export const dynamic = 'force-dynamic';

// GET /api/conversacion?celular=09xxxxxxxx
// Devuelve la conversación de WhatsApp del cliente en ambas cuentas:
//   { MANDI: [...], IND: [...], total }
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const celular = searchParams.get('celular') || searchParams.get('telefono') || '';
    if (!celular) return Response.json({ error: 'falta celular' }, { status: 400 });

    const conv = await getConversacion(celular);
    const total = (conv.MANDI?.length || 0) + (conv.IND?.length || 0);
    return Response.json({ ...conv, total });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
