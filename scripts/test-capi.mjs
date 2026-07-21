/**
 * Pruebas del envío directo a Meta CAPI (reemplazo del webhook de Make).
 * Ejecutar:  node scripts/test-capi.mjs
 *
 * Lo crítico es el HASH: si no coincide con el que venía generando Make, Meta
 * deja de reconocer a los compradores y la optimización de la pauta empeora.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import crypto from 'node:crypto'

const dir = mkdtempSync(join(tmpdir(), 'test-capi-'))
async function cargar(rel) {
  const destino = join(dir, rel.replace(/\//g, '_') + '.mjs')
  writeFileSync(destino, readFileSync(new URL(rel, import.meta.url), 'utf8'))
  return import(pathToFileURL(destino).href)
}

const { normalizarTelefono, pixelDeTienda, capiConfigurado } = await cargar('../lib/metaCapi.js')

let ok = 0, fail = 0
function check(nombre, condicion, detalle = '') {
  if (condicion) { ok++; console.log(`  ok   ${nombre}`) }
  else { fail++; console.log(`  FALLA ${nombre}${detalle ? ` -- ${detalle}` : ''}`) }
}

// Lo que hacía Make: sha256(lower(trim(x))) para email/nombre/ciudad,
// sha256(trim(x)) para telefono y cedula.
const sha = (v) => crypto.createHash('sha256').update(v).digest('hex')

console.log('\n== Compatibilidad del hash con lo que hacia Make ==')
{
  // Make: sha256(lower(trim(correo)))
  const email = '  Ana@Mandarina.COM '
  check('email: minusculas y recortado',
    sha(email.trim().toLowerCase()) === sha('ana@mandarina.com'))

  // Make: sha256(lower(trim(nombre)))
  check('nombre: minusculas y recortado',
    sha(' MARIA JOSE '.trim().toLowerCase()) === sha('maria jose'))

  // Make: sha256(dni) sin transformar
  check('cedula: se hashea tal cual', sha('1712345678') === sha('1712345678'))

  // Un hash sha256 son 64 caracteres hexadecimales.
  check('el hash tiene el formato que espera Meta', /^[a-f0-9]{64}$/.test(sha('x')))
}

console.log('\n== Normalizacion del telefono (mejora sobre Make) ==')
{
  // Make hasheaba lo que llegara. Un '0991234567' generaba un hash que Meta
  // nunca podia emparejar, porque espera el formato internacional.
  check('local con 0 inicial -> 593', normalizarTelefono('0991234567') === '593991234567',
    normalizarTelefono('0991234567'))
  check('ya internacional se respeta', normalizarTelefono('593991234567') === '593991234567')
  check('con + y espacios', normalizarTelefono('+593 99 123 4567') === '593991234567',
    normalizarTelefono('+593 99 123 4567'))
  check('con guiones', normalizarTelefono('099-123-4567') === '593991234567')
  check('9 digitos sin cero', normalizarTelefono('991234567') === '593991234567')
  check('vacio no revienta', normalizarTelefono('') === '' && normalizarTelefono(null) === '')
  check('no deja separadores', !/\D/.test(normalizarTelefono('+593 (99) 123-4567')))
}

console.log('\n== Router por tienda (mismo criterio que Make) ==')
{
  process.env.META_PIXEL_MANDARINA = 'PIXEL_MAN'
  process.env.META_PIXEL_INDSTORE = 'PIXEL_IND'

  check('MANDARINA va a su pixel', pixelDeTienda('MANDARINA') === 'PIXEL_MAN')
  check('INDSTORE va al de IND', pixelDeTienda('INDSTORE') === 'PIXEL_IND')
  check('IND en minusculas tambien', pixelDeTienda('indstore') === 'PIXEL_IND')

  // OJO: el router de Make se llama "NO ES MANDARINA (INDSTORE / YAW)", pero esa
  // rama NUNCA recibia a YAW. El CRM etiquetaba la tienda con
  // `includes('IND') ? 'INDSTORE' : 'MANDARINA'`, asi que 'YAW' llegaba a Make
  // ya rotulado como MANDARINA. Se conserva ese comportamiento para no mover el
  // matching sin querer: las ventas YAW siguen contando en el pixel de Mandarina.
  check('YAW va al pixel de Mandarina, igual que en Make',
    pixelDeTienda('YAW') === 'PIXEL_MAN', pixelDeTienda('YAW'))
  check('vacio cae en Mandarina', pixelDeTienda('') === 'PIXEL_MAN')
}

console.log('\n== Interruptor de migracion ==')
{
  const tokenPrevio = process.env.META_CAPI_TOKEN
  delete process.env.META_CAPI_TOKEN
  check('sin token NO esta configurado (sigue usando Make)', capiConfigurado() === false)
  process.env.META_CAPI_TOKEN = 'x'
  check('con token y pixel SI esta configurado', capiConfigurado() === true)
  if (tokenPrevio === undefined) delete process.env.META_CAPI_TOKEN
  else process.env.META_CAPI_TOKEN = tokenPrevio
}

console.log('\n== La ruta de pedidos conserva el respaldo a Make ==')
{
  const src = readFileSync(new URL('../app/api/pedidos/route.js', import.meta.url), 'utf8')
  check('usa el envio directo cuando hay token', /if \(capiConfigurado\(\)\)/.test(src))
  check('mantiene el webhook de Make como respaldo', /hook\.us2\.make\.com/.test(src))
  check('el CAPI no bloquea la creacion del pedido', /enviarPurchase\([\s\S]{0,200}\.catch\(/.test(src))
}

console.log(`\n${ok} pasaron, ${fail} fallaron\n`)
process.exit(fail === 0 ? 0 : 1)
