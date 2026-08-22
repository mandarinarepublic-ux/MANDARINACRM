// El correo del cliente se guardaba tal cual lo escribían.
//
// Medido el 21-ago-2026: 28 clientes con espacios EN MEDIO del correo. Eran 25
// el 14-ago, o sea que seguían entrando. Cada uno es una factura de Dátil que
// falla, y falla DESPUÉS de la venta.
import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { limpiarEmail, emailPareceValido } from '../lib/email-cliente.js'

test('☠️ quita los espacios de EN MEDIO, no solo las puntas', () => {
  // Casos reales de la base. Un `.trim()` no habría arreglado ni uno.
  assert.strictEqual(limpiarEmail('juanpa_1994@hot mail.com'), 'juanpa_1994@hotmail.com')
  assert.strictEqual(limpiarEmail('edro27@hotmail. com'), 'edro27@hotmail.com')
  assert.strictEqual(limpiarEmail('ariel 31 rodriguez 2005 @gmail.com'), 'ariel31rodriguez2005@gmail.com')
  assert.strictEqual(limpiarEmail('dc_asesoria contable @hotmail.com'), 'dc_asesoriacontable@hotmail.com')
})

test('el NBSP del teclado del celular tambien cuenta', () => {
  // Se ve igual que un espacio y no lo caza un /\s/ en algunos motores.
  assert.strictEqual(limpiarEmail('juan perez@gmail.com'), 'juanperez@gmail.com')
  assert.strictEqual(limpiarEmail('a\tb@gmail.com'), 'ab@gmail.com')
})

test('normaliza a minusculas', () => {
  assert.strictEqual(limpiarEmail('Juan.Perez@GMail.com'), 'juan.perez@gmail.com')
})

test('☠️ NO adivina dominios', () => {
  // "yahoo com" NO se convierte en "yahoo.com": eso ya seria inventar el correo
  // de un cliente, y mandar una factura a una direccion inventada es peor que no
  // mandarla. Estos dos casos se corrigen a mano.
  assert.strictEqual(limpiarEmail('alonso aer @yahoo com'), 'alonsoaer@yahoocom')
  assert.strictEqual(limpiarEmail('elfenixarde 51@gmail@com'), 'elfenixarde51@gmail@com')
})

test('un valor ausente sigue ausente', () => {
  // updateCliente es PARCIAL: `undefined` significa "no toques este campo".
  // Convertirlo en '' borraria el correo del cliente al editarle el nombre.
  assert.strictEqual(limpiarEmail(undefined), undefined)
  assert.strictEqual(limpiarEmail(null), null)
  assert.strictEqual(limpiarEmail(''), '')
})

test('emailPareceValido caza lo que quedo roto', () => {
  assert.strictEqual(emailPareceValido('ana piedad 112009@hotmail.com'), true)
  assert.strictEqual(emailPareceValido('alonso aer @yahoo com'), false, 'sin punto en el dominio')
  assert.strictEqual(emailPareceValido('elfenixarde 51@gmail@com'), false, 'dos arrobas')
  assert.strictEqual(emailPareceValido(''), false)
  assert.strictEqual(emailPareceValido(undefined), false)
})

test('☠️ se limpia en el REPO, en los DOS caminos de escritura', () => {
  // Si se dejara a la pantalla, cada formulario nuevo tendria que acordarse.
  // El upsert por cedula del POST de pedidos pasa por estos dos, asi que los
  // tres caminos quedan cubiertos.
  const src = readFileSync(new URL('../lib/db/clientes.js', import.meta.url), 'utf8')
  const sinComentarios = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
  const usos = sinComentarios.match(/email = limpiarEmail\(email\)/g) || []
  assert.strictEqual(usos.length, 2, 'createCliente y updateCliente')
})

test('la venta NO se bloquea por un correo raro', () => {
  // Frenar un pedido por un email mal escrito seria mucho peor que la factura
  // fallida. `emailPareceValido` existe para AVISAR, no para impedir.
  const src = readFileSync(new URL('../lib/db/clientes.js', import.meta.url), 'utf8')
  assert.ok(!/emailPareceValido/.test(src),
    'el repo de clientes no puede rechazar una escritura por el formato del correo')
})

// ─── Los formularios (21-ago-2026) ───────────────────────────────────────────

test('☠️ el formulario mira la FORMA del correo, no solo que exista', () => {
  // Solo comprobaba `!cliente.email.trim()`. Por ahi entraron los 9 imposibles:
  // "diegopicotv@@mail.com", "gabrielasalvador3108@gmailcom", ".con", ".conm".
  const src = readFileSync(new URL('../app/dashboard/nuevo-pedido/page.js', import.meta.url), 'utf8')
  assert.ok(/emailPareceValido\(cliente\.email\)/.test(src))
  assert.ok(/emitirFactura && !emailPareceValido/.test(src),
    'frena SOLO cuando va con factura: ahi el rebote es seguro')
})

test('☠️ sin factura NO se traba la venta por el correo', () => {
  const src = readFileSync(new URL('../app/dashboard/nuevo-pedido/page.js', import.meta.url), 'utf8')
  const validador = src.slice(src.indexOf('function validateStep1'), src.indexOf('function validateStep2'))
  const frenos = validador.match(/!emailPareceValido/g) || []
  assert.strictEqual(frenos.length, 1, 'un solo freno, y va condicionado a emitirFactura')
  assert.ok(!/return .*emailPareceValido\(cliente\.email\) *\?/.test(validador))
})

test('la pantalla de EDITAR tambien avisa', () => {
  // Es la pantalla por donde se arreglan los correos rotos: es la que mas
  // necesita decir si quedo bien. Ahi no bloquea, solo avisa.
  const src = readFileSync(new URL('../app/dashboard/editar-pedido/[id]/page.js', import.meta.url), 'utf8')
  assert.ok(/emailPareceValido\(emailEdit\)/.test(src))
  assert.ok(/limpiarEmail\(emailEdit\)/.test(src), 'y muestra como va a quedar guardado')
})
