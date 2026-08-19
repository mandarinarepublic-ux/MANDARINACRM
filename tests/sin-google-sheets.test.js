// Google Sheets fuera del camino de una venta.
//
// Hasta el 19-ago-2026 grabar un pedido tocaba Google DOS veces:
//   · `generatePedidoId` leia la hoja PEDIDOS para sacar el numero;
//   · `calcularDiasEntregaDesdeSheet` leia la hoja DIAS_ENTREGA.
// Y ademas cada venta, cambio de estado, pago y guia escribian una copia.
//
// De las dos lecturas existia YA una version que respeta DATA_BACKEND, en
// lib/db/. La ruta usaba la vieja en los dos casos.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'

const ruta = readFileSync(new URL('../app/api/pedidos/route.js', import.meta.url), 'utf8')
const backend = readFileSync(new URL('../lib/db/_backend.js', import.meta.url), 'utf8')
const sinComentarios = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

test('crear un pedido NO importa nada que lea Google directo', () => {
  const codigo = sinComentarios(ruta)
  // `lib/pedidos.js` lee la hoja sin pasar por el switch de backend.
  const importaViejo = /import \{[^}]*\} from '@\/lib\/pedidos'/.exec(codigo)?.[0] || ''
  assert.ok(!/calcularDiasEntregaDesdeSheet/.test(importaViejo),
    'esa version lee la hoja DIAS_ENTREGA siempre; la buena esta en @/lib/db/diasEntrega')
  assert.ok(!/generatePedidoId/.test(importaViejo),
    'esa version leia la hoja PEDIDOS: si Google fallaba, no se podia vender')
  assert.ok(/from '@\/lib\/db\/diasEntrega'/.test(codigo),
    'los plazos salen del repo que respeta DATA_BACKEND')
})

test('lo unico que queda de sheets en la ruta es formato de fecha', () => {
  const desdeSheets = /import \{([^}]*)\} from '@\/lib\/sheets'/.exec(sinComentarios(ruta))?.[1] || ''
  const nombres = desdeSheets.split(',').map((s) => s.trim()).filter(Boolean)
  assert.deepStrictEqual(nombres, ['fechaAhora'],
    'fechaAhora solo formatea una fecha, no llama a Google. Cualquier otra cosa si')
})

test('la copia a Sheets esta APAGADA por defecto', () => {
  const codigo = sinComentarios(backend)
  assert.ok(/DUAL_WRITE_SHEETS/.test(codigo), 'debe existir el interruptor')
  // Apagado por defecto: solo se enciende con el valor explicito.
  assert.ok(/process\.env\.DUAL_WRITE_SHEETS === '1'/.test(codigo),
    'sin la variable puesta, NO se escribe en Sheets')
  assert.ok(/secondaryKey === 'sheets' \? DUAL_WRITE_SHEETS/.test(codigo),
    'la escritura espejo a Sheets debe depender del interruptor')
})

test('si alguien vuelve a poner Sheets de primaria, se avisa a gritos', () => {
  // La hoja quedo congelada hoy. Volver a ella en silencio partiria los datos en
  // dos sin que nadie se entere, que es como empiezan estos problemas.
  const codigo = sinComentarios(backend)
  assert.ok(/primaryKey === 'sheets' && !DUAL_WRITE_SHEETS/.test(codigo),
    'debe detectarse el caso')
  assert.ok(/console\.error/.test(codigo), 'y decirlo como error, no como aviso menor')
})

test('el codigo de Sheets NO se borro: solo dejo de llamarse', () => {
  // Apagar es reversible; borrar no. Si manana hace falta volver, la vuelta es
  // una variable de entorno, no recuperar codigo de un commit viejo.
  assert.ok(/sheets:\s*async/.test(backend) || /sheets, supabase/.test(backend),
    'write() debe seguir aceptando la implementacion de sheets')
})
