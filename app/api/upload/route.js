export const dynamic = 'force-dynamic'

// Recibe un archivo multipart y lo sube a Cloudinary como recurso "auto"
// Devuelve { url } con la URL de Cloudinary
export async function POST(req) {
  try {
    const formData = await req.formData()
    const file = formData.get('file')
    const tipo = formData.get('tipo') || 'diseno'

    if (!file) return Response.json({ error: 'No se recibió archivo' }, { status: 400 })

    const cloudName  = process.env.CLOUDINARY_CLOUD_NAME
    const apiKey     = process.env.CLOUDINARY_API_KEY
    const apiSecret  = process.env.CLOUDINARY_API_SECRET

    if (!cloudName || !apiKey || !apiSecret) {
      return Response.json({ error: 'Cloudinary no configurado' }, { status: 500 })
    }

    // Leer el archivo como ArrayBuffer → base64
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const base64 = buffer.toString('base64')
    const mimeType = file.type || 'application/octet-stream'
    const dataUri = `data:${mimeType};base64,${base64}`

    const folder = `mandarina-pro/${tipo}`
    const fileName = file.name?.replace(/\.[^.]+$/, '') || `${tipo}_${Date.now()}`
    const publicId = `${folder}/${fileName}_${Date.now()}`

    const timestamp = Math.round(Date.now() / 1000)
    const crypto = await import('crypto')
    const sigString = `folder=${folder}&public_id=${publicId}&resource_type=auto&timestamp=${timestamp}${apiSecret}`
    const signature = crypto.createHash('sha1').update(sigString).digest('hex')

    const uploadForm = new FormData()
    uploadForm.append('file', dataUri)
    uploadForm.append('public_id', publicId)
    uploadForm.append('folder', folder)
    uploadForm.append('timestamp', String(timestamp))
    uploadForm.append('api_key', apiKey)
    uploadForm.append('signature', signature)
    uploadForm.append('resource_type', 'auto')

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
      { method: 'POST', body: uploadForm }
    )

    if (!res.ok) {
      const err = await res.json()
      throw new Error('Cloudinary: ' + JSON.stringify(err))
    }

    const data = await res.json()
    return Response.json({ url: data.secure_url, publicId: data.public_id })

  } catch(e) {
    console.error('Upload error:', e)
    return Response.json({ error: e.message }, { status: 500 })
  }
}
