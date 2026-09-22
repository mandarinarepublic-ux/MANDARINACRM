export const dynamic = 'force-dynamic'

import { sesionActual } from '@/lib/auth'
import { getUsuarioById } from '@/lib/db/usuarios'
import { getPedidoDeCorte } from '@/lib/db/corte'
import { updateSubestadoCorteLote } from '@/lib/db/detalle'
import { updateCorteDePedido } from '@/lib/db/pedidos'
import { registrarEventosPrenda } from '@/lib/db/prendaEventos'
import { logCambio } from '@/lib/pedidos'
import { planCortarTodo, planFaltaAlgo } from '@/lib/cortePedido'
import { registrarEvento } from '@/lib/eventos'
import { contextoDeError } from '@/lib/detalle-evento'

// Corte sobre el PEDIDO entero.
//
// POR QUÉ EXISTE: el cortador marcaba prenda por prenda. Un pedido de 6 prendas
// le costaba 7 clics (abrir + 6) y scroll entre seis tarjetas con foto — desde
// el celular, eso es la mitad del trabajo de registrar el trabajo.
//
// Dos acciones, simétricas: `CORTADO` deja el pedido cortado y suelta la traba;
// `FALTA` lo devuelve entero a pendiente y lo traba con el motivo escrito.
//
// ☠️ UNA petición, no N. Disparar seis PATCH desde el navegador deja el pedido a
// medio marcar si el cuarto falla, y nadie se entera: la pantalla ya pintó los
// seis botones en verde.
//
// La identidad sale de la COOKIE, nunca del cuerpo: `_usuarioId` fue el patrón
// viejo y significa que el navegador decide quién firma el trabajo.
const ROLES_PERMITIDOS = ['ADMIN', 'CORTE']

export async function PATCH(req, { params }) {
  const { id } = params
  let usuario = null
  let accion = ''

  try {
    const sesion = await sesionActual()
    if (!sesion?.id) return Response.json({ error: 'No autenticado' }, { status: 401 })

    usuario = await getUsuarioById(sesion.id)
    if (!usuario) return Response.json({ error: 'Sesion invalida, vuelve a entrar' }, { status: 401 })
    if (usuario.ACTIVO !== 'TRUE') return Response.json({ error: 'Usuario desactivado' }, { status: 403 })
    if (!ROLES_PERMITIDOS.includes(String(usuario.ROL).toUpperCase())) {
      return Response.json({ error: 'Esta accion es de corte' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    accion = String(body.accion || '').trim().toUpperCase()
    if (!['CORTADO', 'FALTA'].includes(accion)) {
      return Response.json({ error: 'Accion no valida' }, { status: 400 })
    }

    const pedido = await getPedidoDeCorte(id)
    if (!pedido) return Response.json({ error: 'Pedido no encontrado' }, { status: 404 })

    // La bandeja de Corte solo enseña EN_FABRICA. Actuar sobre un pedido que ya
    // salió de fábrica escribiría un corte que nadie va a ver, y encima movería
    // prendas que otra área ya dio por terminadas.
    if (pedido.ESTADO_PEDIDO !== 'EN_FABRICA') {
      return Response.json(
        { error: `Este pedido ya no esta en fabrica (${pedido.ESTADO_PEDIDO}): no se puede cortar desde aca.` },
        { status: 409 }
      )
    }

    // El USUARIO_ID, no el nombre: es lo que guardan hoy la bitácora y
    // `prenda_eventos` (las rutas mandaban `_usuarioId`). Firmar con el nombre
    // dejaría la ficha del pedido mezclando dos formas de nombrar a la misma
    // persona, línea por línea.
    const quien = usuario.USUARIO_ID || sesion.id
    const plan = accion === 'CORTADO'
      ? planCortarTodo({ pedido, items: pedido.items, usuario: quien })
      : planFaltaAlgo({ pedido, items: pedido.items, nota: body.nota, usuario: quien })

    if (!plan.ok) return Response.json({ error: plan.error }, { status: 400 })

    // ORDEN A PROPÓSITO:
    //
    // 1º las prendas y 2º la traba del pedido. Si falla lo primero, no se
    //    escribió nada y el cortador ve el error. Si fallara al revés, el pedido
    //    quedaría trabado con sus prendas diciendo otra cosa.
    // 3º la bitácora y los eventos, que son NO-THROW: registrar es importante,
    //    pero no puede tumbar un trabajo que ya está guardado. Por eso las
    //    fechas viven además en las columnas del pedido, que sí pueden fallar
    //    a la vista.
    await updateSubestadoCorteLote(plan.itemIds, plan.subestado)
    await updateCorteDePedido(id, plan.columnas)

    // CON await los dos: en serverless la instancia se congela al responder y
    // el registro muere justo cuando hay algo que registrar.
    await logCambio(id, plan.log.campo, plan.log.antes, plan.log.despues, quien)
    await registrarEventosPrenda(plan.eventos)

    return Response.json({
      ok: true,
      accion,
      subestado: plan.subestado,
      prendas: plan.itemIds.length,
      nota: plan.columnas.corte_pendiente_nota || '',
      fecha: plan.columnas.corte_pendiente_fecha || plan.columnas.corte_terminado_fecha || '',
      usuario: quien,
    })
  } catch (e) {
    console.error('PATCH /api/corte/pedido:', e)
    await registrarEvento({
      fuente: 'supabase', nivel: 'error',
      mensaje: `Corte por pedido fallo (${accion || 'sin accion'}) en ${id}: ${e.message}`,
      detalle: contextoDeError({ error: e, ruta: '/api/corte/pedido', usuario, params: { id, accion } }),
    })
    return Response.json({ error: e.message }, { status: 500 })
  }
}
