export const dynamic = 'force-dynamic'

export async function POST(req) {
  try {
    const formData = await req.formData()
    const file = formData.get('file')
    const tipo = formData.get('tipo') || 'diseno'

    if (!file) return Response.json({ error: 'No se recibió archivo' }, { status: 400 })

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME
    const apiKey    = process.env.CLOUDINARY_API_KEY
    const apiSecret = process.env.CLOUDINARY_API_SECRET
    if (!cloudName || !apiKey || !apiSecret)
      return Response.json({ error: 'Cloudinary no configurado' }, { status: 500 })

    const arrayBuffer = await file.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')
    const mimeType = file.type || 'application/octet-stream'
    const dataUri = `data:${mimeType};base64,${base64}`

    const folder   = `mandarina-pro/${tipo}`
    const fileName = (file.name || `${tipo}_${Date.now()}`).replace(/\.[^.]+$/, '')
    const publicId = `${folder}/${fileName}_${Date.now()}`
    const timestamp = Math.round(Date.now() / 1000)

    const crypto = await import('crypto')
    // ✅ FIX: NO incluir resource_type en la firma (Cloudinary lo excluye al firmar)
    const sigString = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`
    const signature = crypto.createHash('sha1').update(sigString).digest('hex')

    const form = new FormData()
    form.append('file', dataUri)
    form.append('public_id', publicId)
    form.append('folder', folder)
    form.append('timestamp', String(timestamp))
    form.append('api_key', apiKey)
    form.append('signature', signature)
    form.append('resource_type', 'auto') // se envía, pero NO se firma

    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
      method: 'POST', body: form,
    })
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
