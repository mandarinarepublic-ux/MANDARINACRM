// Helpers de subida a Cloudinary (vía /api/upload) para el cliente.
//
// Contexto del bug: las funciones serverless de Vercel tienen un límite de
// tamaño de request (~4.5 MB). Una foto de celular en calidad original supera
// ese límite y Vercel responde "Request Entity Too Large" en TEXTO PLANO (no
// JSON). Al hacer res.json() en el cliente eso reventaba con:
//   Unexpected token 'R', "Request En"... is not valid JSON
// dejando al vendedor sin poder grabar el pedido.
//
// Solución: reescalar las fotos antes de subir (buena calidad, pero por debajo
// del límite) y parsear la respuesta del servidor de forma robusta.

// Sube un blob/File a /api/upload y devuelve la URL de Cloudinary.
// Parseo robusto: si el servidor responde algo que no es JSON (p. ej. el 413
// "Request Entity Too Large" de Vercel), damos un error claro en vez de romper.
async function postUpload(blob, filename, tipo) {
  const form = new FormData()
  form.append('file', blob, filename)
  form.append('tipo', tipo || 'diseno')

  let res
  try {
    res = await fetch('/api/upload', { method: 'POST', body: form })
  } catch {
    throw new Error('No se pudo conectar para subir la imagen. Revisa tu conexión.')
  }

  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { /* respuesta no-JSON */ }

  if (!res.ok || !data || !data.url) {
    if (res.status === 413 || /request entity too large|payload too large|too large/i.test(text))
      throw new Error('La imagen es demasiado pesada para subirla. Usa una foto más liviana.')
    throw new Error((data && data.error) || 'Error al subir la imagen')
  }
  return data.url
}

// Reescala una imagen grande preservando buena calidad (máx MAX px por lado,
// JPEG calidad 0.9). Devuelve un Blob JPEG. Muy por debajo del límite de subida.
function comprimirImagen(file, MAX = 2000, quality = 0.9) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      let w = img.width, h = img.height
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX }
        else { w = Math.round(w * MAX / h); h = MAX }
      }
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      canvas.toBlob(
        b => b ? resolve(b) : reject(new Error('No se pudo procesar la imagen')),
        'image/jpeg', quality
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Imagen inválida')) }
    img.src = url
  })
}

// Sube una FOTO de referencia (pecho/espalda/mangas). Si es una imagen grande
// se reescala primero para no exceder el límite de la subida. Devuelve la URL.
export async function subirFoto(file, tipo = 'diseno') {
  if (!file) return ''
  let blob = file
  let name = file.name || 'foto.jpg'
  if (file.type && file.type.startsWith('image/')) {
    try {
      blob = await comprimirImagen(file)
      name = name.replace(/\.[^.]+$/, '') + '.jpg'
    } catch {
      blob = file // si el reescalado falla, intentamos subir el original
    }
  }
  return postUpload(blob, name, tipo)
}

// Sube el ARCHIVO de diseño (AI/PSD/PDF/EPS/SVG/PNG/...) SIN recomprimir, para
// mantener la calidad original.
//
// Lo sube DIRECTO del navegador a Cloudinary usando una firma que pide a
// /api/upload-sign. Así el archivo (que puede ser pesado) NO pasa por la función
// serverless de Vercel y no choca con su límite de ~4.5 MB. Devuelve la URL.
export async function subirArchivo(file, tipo = 'diseno') {
  if (!file) return ''

  // 1) Pedir la firma al servidor (solo JSON, sin el archivo).
  let sign
  try {
    const r = await fetch('/api/upload-sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, filename: file.name || '' }),
    })
    const txt = await r.text()
    try { sign = txt ? JSON.parse(txt) : null } catch { sign = null }
    if (!r.ok || !sign || !sign.signature)
      throw new Error((sign && sign.error) || 'No se pudo preparar la subida')
  } catch (e) {
    throw new Error(e.message || 'No se pudo preparar la subida del archivo')
  }

  // 2) Subir el archivo DIRECTO a Cloudinary con la firma.
  const form = new FormData()
  form.append('file', file)
  form.append('public_id', sign.publicId)
  form.append('folder', sign.folder)
  form.append('timestamp', String(sign.timestamp))
  form.append('api_key', sign.apiKey)
  form.append('signature', sign.signature)
  form.append('resource_type', 'auto')

  let res
  try {
    res = await fetch(`https://api.cloudinary.com/v1_1/${sign.cloudName}/auto/upload`, {
      method: 'POST', body: form,
    })
  } catch {
    throw new Error('No se pudo conectar con Cloudinary para subir el archivo.')
  }

  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { /* no-JSON */ }

  if (!res.ok || !data || !data.secure_url) {
    if (res.status === 413 || /too large|file size too large/i.test(text))
      throw new Error('El archivo es demasiado pesado para Cloudinary. Comprímelo o súbelo en PDF.')
    throw new Error((data && data.error && data.error.message) || 'Error al subir el archivo')
  }
  return data.secure_url
}
