// El tablero de conexiones nació el 17-oct-2026: Meta frenó TODOS los WhatsApp de
// IND por un pago pendiente y nadie se enteró hasta que reclamaron los vendedores.
// Estas pruebas cuidan que una luz vieja nunca se lea como "todo bien".
import test from 'node:test'
import assert from 'node:assert/strict'
import { estadoEfectivo, ordenarParaPanel, resumen, textoAlertaConexiones, VENCE_HORAS } from '../lib/conexiones.js'

const AHORA = Date.parse('2026-10-18T15:00:00Z')
const hace = (h) => new Date(AHORA - h * 3_600_000).toISOString()

test('una luz revisada hace poco se muestra tal cual', () => {
  const f = estadoEfectivo({ servicio: 'vercel', estado: 'verde', revisado_en: hace(2) }, AHORA)
  assert.equal(f.estado, 'verde')
  assert.equal(f.vencida, false)
})

test('un verde VIEJO no es verde: pasa a gris "sin revisar"', () => {
  const f = estadoEfectivo({ servicio: 'vercel', estado: 'verde', detalle: 'ok', revisado_en: hace(VENCE_HORAS + 3) }, AHORA)
  assert.equal(f.estado, 'gris')
  assert.match(f.detalle, /Sin revisar hace 20 h/)
})

test('si la RUTINA deja de correr, su luz se pone ROJA (el tablero entero miente)', () => {
  const f = estadoEfectivo({ servicio: 'claude_rutina', estado: 'verde', revisado_en: hace(50) }, AHORA)
  assert.equal(f.estado, 'rojo')
  assert.match(f.detalle, /no corre hace 2 días/)
})

test('el hueco normal entre las 15:00 y las 7:00 (16 h) NO cuenta como vencido', () => {
  assert.equal(estadoEfectivo({ servicio: 'claude_rutina', estado: 'verde', revisado_en: hace(16) }, AHORA).estado, 'verde')
})

test('en el panel lo roto va primero dentro de cada grupo', () => {
  const orden = ordenarParaPanel([
    { nombre: 'B', grupo: 'Infraestructura', estado: 'verde' },
    { nombre: 'A', grupo: 'Infraestructura', estado: 'rojo' },
    { nombre: 'W', grupo: 'Mensajería', estado: 'verde' },
  ]).map(f => f.nombre)
  assert.deepEqual(orden, ['W', 'A', 'B'])
})

test('todo verde = no se manda Telegram', () => {
  assert.equal(textoAlertaConexiones([{ nombre: 'X', estado: 'verde' }]), '')
})

test('la alerta pone los rojos primero y dice que algo está parado', () => {
  const t = textoAlertaConexiones([
    { nombre: 'Make', estado: 'amarillo', detalle: '90 % de operaciones' },
    { nombre: 'WhatsApp IND', estado: 'rojo', detalle: 'pago pendiente con Meta' },
    { nombre: 'Vercel', estado: 'verde' },
  ], { baseUrl: 'https://crm.x' })
  assert.match(t, /^🚨 \*1 conexión en ROJO\*/)
  assert.ok(t.indexOf('WhatsApp IND') < t.indexOf('Make'))
  assert.doesNotMatch(t, /Vercel/)
  assert.match(t, /https:\/\/crm\.x\/dashboard\/errores$/)
})

test('resumen cuenta por color', () => {
  assert.deepEqual(resumen([{ estado: 'verde' }, { estado: 'rojo' }, { estado: 'verde' }]), { verde: 2, amarillo: 0, rojo: 1, gris: 0 })
})
