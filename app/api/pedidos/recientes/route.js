import { listPedidosRecientes } from '@/lib/db/pedidos';

// Endpoint LIVIANO para el hook useNuevosPedidos (notificación de pedidos
// nuevos). Devuelve solo los pedidos EN_FABRICA con PEDIDO_ID + áreas de sus
// items, SIN el join pesado de /api/pedidos (pagos/cliente/guía). Reemplaza el
// fetch de la lista completa cada 30s que hacía cada pantalla del taller.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const pedidos = await listPedidosRecientes();
    return Response.json({ pedidos }, {
      // Cache corto COMPARTIDO en el edge: todas las pantallas del taller pollean
      // lo MISMO → comparten una ejecución por ventana en vez de una c/u. Un toast
      // de pedido nuevo unos segundos más tarde es irrelevante.
      headers: { 'Cache-Control': 's-maxage=20, stale-while-revalidate=60' },
    });
  } catch (e) {
    console.error('GET pedidos/recientes error:', e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
