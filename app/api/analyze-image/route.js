export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Analiza una imagen (diseño de estampado) y devuelve una descripción en inglés
// lista para un prompt de generación de imagen. La API key vive SOLO en el
// servidor — el navegador manda el base64 de la imagen y recibe el texto.
//
// Requiere ANTHROPIC_API_KEY en el entorno (.env.local y en Vercel).
export async function POST(req) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return Response.json(
        { error: 'ANTHROPIC_API_KEY no configurada en el servidor' },
        { status: 500 }
      )
    }

    const { base64, mediaType } = await req.json().catch(() => ({}))
    if (!base64) {
      return Response.json({ error: 'Falta la imagen (base64)' }, { status: 400 })
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType || 'image/png',
                  data: base64,
                },
              },
              {
                type: 'text',
                text: 'Describe this graphic design in English for an image generation prompt. Include: exact colors, visual elements, graphic style, typography if any, textures, icons or illustrations. Be specific and technical. Max 60 words. Only describe the design, nothing else.',
              },
            ],
          },
        ],
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      console.error('analyze-image Anthropic error:', data)
      return Response.json(
        { error: data?.error?.message || 'Error de Anthropic' },
        { status: res.status }
      )
    }

    const description =
      data.content?.find((b) => b.type === 'text')?.text || 'custom graphic design'
    return Response.json({ description })
  } catch (e) {
    console.error('analyze-image error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
