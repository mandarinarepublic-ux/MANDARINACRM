export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { requireAdmin } from '@/lib/auth'
import { TALLAS } from '@/lib/cotizacion'

// Mira las fotos y redacta el producto entero — SOLO ADMIN.
// Mismo patron que /api/analyze-image: la clave vive SOLO en el servidor.

const INSTRUCCIONES = `Eres quien redacta las fichas de producto de una marca ecuatoriana de ropa.
Miras las fotos de UN producto y devuelves su ficha lista para Shopify, en español de Ecuador.

PROHIBIDO INVENTAR. Escribe solo lo que se ve en las fotos. Nunca menciones:
composición de la tela, gramaje, país de fabricación, medidas, ni instrucciones de lavado.
Si no está en la imagen, no se escribe.

Devuelve SOLO un objeto JSON, sin texto alrededor, con estas claves:
- titulo: máximo 70 caracteres, sin el nombre de la marca
- handle: minúsculas, sin tildes ni espacios, separado por guiones
- descripcionHtml: 2 párrafos <p> y una lista <ul> de 3 a 5 <li>
- seoTitulo: máximo 60 caracteres
- seoDescripcion: entre 120 y 155 caracteres
- tags: 5 a 8 palabras clave en minúsculas
- tipoProducto: una o dos palabras (por ejemplo "Chaquetas")
- altTextos: un texto descriptivo por cada foto, EN EL MISMO ORDEN, máximo 120 caracteres
- tallasSugeridas: subconjunto de ${JSON.stringify(TALLAS)} típico de esa prenda; [] si no lleva tallas
- categoriaBusqueda: UNA o DOS palabras EN ESPAÑOL para buscar la categoría (por ejemplo "Chaquetas")
- anuncios: { metaTexto (máx 125), metaTitular (máx 40), googleTitulares (3, máx 30 cada uno), googleDescripciones (2, máx 90 cada una) }`

export async function POST(req) {
  try {
    const auth = await requireAdmin(req)
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return Response.json({ error: 'ANTHROPIC_API_KEY no configurada' }, { status: 500 })

    const { fotos, precio } = await req.json().catch(() => ({}))
    if (!Array.isArray(fotos) || !fotos.length) {
      return Response.json({ error: 'Hacen falta las fotos' }, { status: 400 })
    }

    const contenido = fotos.map((url) => ({ type: 'image', source: { type: 'url', url } }))
    contenido.push({ type: 'text', text: `${INSTRUCCIONES}\n\nPrecio de venta: $${precio}. Son ${fotos.length} foto(s).` })

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-opus-5',
        // ⚠️ No lo bajes. En claude-opus-5 el thinking esta ENCENDIDO por defecto y
        // sus tokens salen de aqui: con 2000 el JSON se trunca y no se puede parsear.
        max_tokens: 16000,
        messages: [{ role: 'user', content: contenido }],
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      console.error('redactar Anthropic error:', data)
      return Response.json({ error: data?.error?.message || 'Error de Anthropic' }, { status: 502 })
    }

    // ☠️ Hay que BUSCAR el bloque de texto, no asumir que es el primero. En
    // claude-opus-5 el thinking viene encendido por defecto, asi que content[0]
    // es un bloque `thinking` (vacio, porque el display por defecto lo omite) y
    // leer content[0].text daba '' → JSON.parse fallaba en TODAS las llamadas.
    const texto = (data?.content || []).find((b) => b?.type === 'text')?.text || ''

    // Si se corto por el tope de tokens, el JSON esta incompleto: mejor decirlo
    // que dejar que JSON.parse falle con un mensaje que despista.
    if (data?.stop_reason === 'max_tokens') {
      return Response.json({ error: 'La respuesta de la IA se cortó por longitud. Vuelve a intentar.' }, { status: 502 })
    }

    const crudo = texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1)
    let ficha
    try {
      ficha = JSON.parse(crudo)
    } catch {
      return Response.json({ error: 'La IA no devolvió un JSON válido, vuelve a intentar' }, { status: 502 })
    }

    // ⚠️ Lo que devuelve la IA es texto libre, no un contrato: CUALQUIER campo
    // puede llegar con el tipo equivocado, y `|| []` no protege de eso.
    //   · si `tallasSugeridas` viene como string, `.filter` no existe y la ruta
    //     muere con un 500 mudo en vez de un aviso que se entienda;
    //   · si `altTextos` viene como string, `altTextos?.[i]` devuelve LETRAS
    //     SUELTAS, y el alt de cada foto acabaría siendo una letra.
    // Por eso se comprueba el tipo antes de tocarlos.
    const alts = Array.isArray(ficha.altTextos) ? ficha.altTextos : []
    const tallas = Array.isArray(ficha.tallasSugeridas) ? ficha.tallasSugeridas : []

    // Un alt por foto, sí o sí: construirProductSetInput rechaza los vacíos y
    // es mejor que el hueco se vea en pantalla que reventar al publicar.
    ficha.altTextos = fotos.map((_, i) => String(alts[i] || ''))
    ficha.tallasSugeridas = tallas.filter((t) => TALLAS.includes(t))

    // Mismo riesgo que altTextos/tallasSugeridas: si la IA devuelve `tags` como
    // string en vez de array, (ficha.tags || []).map(...) revienta la pantalla
    // de revision entera y se pierde la redaccion ya pagada.
    ficha.tags = (Array.isArray(ficha.tags) ? ficha.tags : [])
      .filter((t) => typeof t === 'string' && t.trim())
      .map((t) => t.trim().toLowerCase())

    return Response.json(ficha)
  } catch (e) {
    console.error('redactar error:', e.message)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
