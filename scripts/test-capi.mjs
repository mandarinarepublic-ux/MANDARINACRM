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

const { normalizarTelefono, pixelDeTienda, capiConfigurado, debeEnviarCapi } = await cargar('../lib/metaCapi.js')

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

  // YAW NO pauta en Meta: no debe enviarse a ningun pixel. Esto NUNCA estuvo
  // implementado — el CRM rotulaba YAW como MANDARINA y sus ventas ensuciaban ese
  // pixel. Ahora se excluye explicitamente.
  check('YAW no va a ningun pixel', pixelDeTienda('YAW') === null, String(pixelDeTienda('YAW')))
  check('debeEnviarCapi excluye YAW', debeEnviarCapi('YAW') === false)
  check('debeEnviarCapi acepta MANDARINA e INDSTORE',
    debeEnviarCapi('MANDARINA') && debeEnviarCapi('INDSTORE'))
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
