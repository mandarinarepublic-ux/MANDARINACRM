// Cloudinary upload via REST API (no SDK needed)
export async function uploadToCloudinary(base64Data, fileName, folder) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary credentials not configured')
  }

  // Clean base64
  const base64 = base64Data.replace(/^data:[^;]+;base64,/, '')
  
  // Generate signature
  const timestamp = Math.round(Date.now() / 1000)
  const publicId = `${folder}/${fileName.replace(/\.[^.]+$/, '')}`
  
  const crypto = await import('crypto')
  const sigString = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`
  const signature = crypto.createHash('sha1').update(sigString).digest('hex')

  // Build form data
  const formData = new FormData()
  formData.append('file', `data:image/jpeg;base64,${base64}`)
  formData.append('upload_preset', '') 
  formData.append('public_id', publicId)
  formData.append('folder', folder)
  formData.append('timestamp', timestamp)
  formData.append('api_key', apiKey)
  formData.append('signature', signature)

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error('Cloudinary upload failed: ' + JSON.stringify(err))
  }

  const data = await res.json()
  return {
    url: data.secure_url,
    publicId: data.public_id,
  }
}

export async function uploadFileToCloudinary(base64Data, fileName, folder) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET

  const timestamp = Math.round(Date.now() / 1000)
  const publicId = `${folder}/${fileName.replace(/\.[^.]+$/, '')}`

  const crypto = await import('crypto')
  const sigString = `folder=${folder}&public_id=${publicId}&resource_type=auto&timestamp=${timestamp}${apiSecret}`
  const signature = crypto.createHash('sha1').update(sigString).digest('hex')

  const base64 = base64Data.replace(/^data:[^;]+;base64,/, '')
  const mimeMatch = base64Data.match(/^data:([^;]+);base64,/)
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream'

  const formData = new FormData()
  formData.append('file', `data:${mime};base64,${base64}`)
  formData.append('public_id', publicId)
  formData.append('folder', folder)
  formData.append('timestamp', timestamp)
  formData.append('api_key', apiKey)
  formData.append('signature', signature)
  formData.append('resource_type', 'auto')

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error('Cloudinary upload failed: ' + JSON.stringify(err))
  }

  const data = await res.json()
  return { url: data.secure_url, publicId: data.public_id }
}
