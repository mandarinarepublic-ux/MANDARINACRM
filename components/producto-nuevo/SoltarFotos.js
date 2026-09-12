'use client'
import { useState } from 'react'

// Zona para soltar las fotos de UN producto.
//
// Suben del navegador DIRECTO a Cloudinary con la firma de /api/upload-sign:
// así no pasan por la función serverless y no las frena el tope de ~4,5 MB de
// Vercel. La PRIMERA foto es la principal del producto.
export default function SoltarFotos({ fotos, onCambio }) {
  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')

  async function subirUna(file) {
    const firmaRes = await fetch('/api/upload-sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'producto', filename: file.name }),
    })
    if (!firmaRes.ok) throw new Error('No se pudo firmar la subida')
    const f = await firmaRes.json()

    const form = new FormData()
    form.append('file', file)
    form.append('api_key', f.apiKey)
    form.append('timestamp', f.timestamp)
    form.append('folder', f.folder)
    form.append('public_id', f.publicId)
    form.append('signature', f.signature)

    const subida = await fetch(`https://api.cloudinary.com/v1_1/${f.cloudName}/auto/upload`, {
      method: 'POST', body: form,
    })
    if (!subida.ok) throw new Error(`Cloudinary rechazó ${file.name}`)
    const { secure_url } = await subida.json()
    return { url: secure_url, alt: '' }
  }

  async function agregar(lista) {
    const imagenes = Array.from(lista).filter((f) => f.type.startsWith('image/'))
    if (!imagenes.length) return
    setSubiendo(true); setError('')
    try {
      const nuevas = []
      for (const f of imagenes) nuevas.push(await subirUna(f))
      onCambio([...fotos, ...nuevas])
    } catch (e) {
      setError(e.message)
    } finally {
      setSubiendo(false)
    }
  }

  const mover = (i, salto) => {
    const j = i + salto
    if (j < 0 || j >= fotos.length) return
    const copia = [...fotos]
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
    onCambio(copia)
  }

  return (
    <div>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); agregar(e.dataTransfer.files) }}
        style={{ border: '2px dashed #ccc', borderRadius: 8, padding: 32, textAlign: 'center' }}
      >
        <p>{subiendo ? 'Subiendo…' : 'Arrastra aquí las fotos de un producto'}</p>
        <input type="file" accept="image/*" multiple disabled={subiendo}
          onChange={(e) => agregar(e.target.files)} />
      </div>

      {error && <p style={{ color: '#c00' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        {fotos.map((f, i) => (
          <div key={f.url} style={{ width: 110 }}>
            <img src={f.url} alt="" style={{ width: '100%', borderRadius: 6 }} />
            <small>{i === 0 ? '★ principal' : `#${i + 1}`}</small>
            <div>
              <button type="button" onClick={() => mover(i, -1)} disabled={i === 0}>←</button>
              <button type="button" onClick={() => mover(i, 1)} disabled={i === fotos.length - 1}>→</button>
              <button type="button" onClick={() => onCambio(fotos.filter((_, j) => j !== i))}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
