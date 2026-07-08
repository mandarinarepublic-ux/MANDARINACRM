export const dynamic = 'force-dynamic'

// Devuelve una FIRMA para que el navegador suba el archivo DIRECTO a Cloudinary,
// sin pasar por esta función serverless (así se evita el límite de ~4.5 MB de
// Vercel con archivos de diseño pesados: AI/PSD/PDF). Solo viaja JSON pequeño;
// el API secret nunca sale del servidor.
//
// El esquema de firma es idéntico al de /api/upload (probado en producción):
//   sha1( folder=...&public_id=...&timestamp=...<apiSecret> )
export async function POST(req) {
  try {
    const { tipo = 'diseno', filename = '' } = await req.json().catch(() => ({}))

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME
    const apiKey    = process.env.CLOUDINARY_API_KEY
    const apiSecret = process.env.CLOUDINARY_API_SECRET
    if (!cloudName || !apiKey || !apiSecret)
      return Response.json({ error: 'Cloudinary no configurado' }, { status: 500 })

    const folder    = `mandarina-pro/${tipo}`
    const base      = (filename || tipo).replace(/\.[^.]+$/, '').replace(/[^\w-]/g, '_') || tipo
    const timestamp = Math.round(Date.now() / 1000)
    const publicId  = `${folder}/${base}_${Date.now()}`

    const crypto = await import('crypto')
    // NO se firman: file, cloud_name, resource_type ni api_key (Cloudinary los excluye).
    const sigString = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`
    const signature = crypto.createHash('sha1').update(sigString).digest('hex')

    return Response.json({ cloudName, apiKey, timestamp, folder, publicId, signature })
  } catch (e) {
    console.error('upload-sign error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
