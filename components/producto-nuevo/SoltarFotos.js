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
  // Solo pinta la zona de naranja mientras algo la sobrevuela: no toca ninguna
  // decisión de subida, es puramente el aviso visual que pedía la tarea.
  const [arrastrando, setArrastrando] = useState(false)

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
    if (subiendo) return          // una tanda a la vez: soltar encima no encima

    setSubiendo(true); setError('')

    // ☠️ Cada foto se guarda por su cuenta. Antes un `throw` a media tanda se
    // llevaba puestas TODAS: si soltabas 3 y fallaba la segunda, la primera ya
    // estaba subida a Cloudinary pero la pantalla quedaba vacía y tocaba
    // arrastrar todo de nuevo (dejando la foto huérfana allá). Lo que se subió
    // bien se queda; de lo que falló se avisa con su nombre.
    const nuevas = []
    const fallaron = []
    for (const f of imagenes) {
      try {
        nuevas.push(await subirUna(f))
      } catch (e) {
        fallaron.push(`${f.name} (${e.message})`)
      }
    }

    if (nuevas.length) onCambio([...fotos, ...nuevas])
    setError(fallaron.length ? `No se pudieron subir: ${fallaron.join(' · ')}` : '')
    setSubiendo(false)
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
      {/* Mientras sube, la zona no acepta nada: el <input> se deshabilita solo,
          pero soltar encima del div se le escapaba y disparaba una segunda tanda
          en paralelo sobre el mismo estado. */}
      <div
        onDragOver={(e) => { e.preventDefault(); if (!subiendo) setArrastrando(true) }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastrando(false); if (!subiendo) agregar(e.dataTransfer.files) }}
        className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors ${
          arrastrando ? 'border-mandarina-500 bg-mandarina-500/10' : 'border-gray-700 bg-gray-800/40'
        } ${subiendo ? 'opacity-50' : ''}`}
      >
        <p className="text-sm text-gray-300 mb-3">
          {subiendo ? 'Subiendo…' : 'Arrastra aquí las fotos del producto'}
        </p>
        <input type="file" accept="image/*" multiple disabled={subiendo}
          onChange={(e) => agregar(e.target.files)}
          className="text-xs text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-gray-700 file:text-white hover:file:bg-gray-600 file:cursor-pointer" />
      </div>

      {error && <p className="text-red-400 text-xs mt-2">⚠️ {error}</p>}

      {!!fotos.length && (
        <div className="flex gap-3 mt-4 flex-wrap">
          {fotos.map((f, i) => (
            <div key={f.url} className={`w-28 rounded-xl p-1.5 ${i === 0 ? 'ring-2 ring-mandarina-500' : ''}`}>
              <img src={f.url} alt="" className="w-full rounded-lg" />
              <div className="mt-1 text-center">
                {i === 0
                  ? <span className="badge bg-mandarina-500/20 text-mandarina-400 text-[10px]">Principal</span>
                  : <span className="text-[10px] text-gray-500">#{i + 1}</span>}
              </div>
              <div className="flex justify-center gap-1 mt-1">
                <button type="button" onClick={() => mover(i, -1)} disabled={i === 0}
                  className="btn-ghost text-xs py-0.5 px-2 disabled:opacity-30">←</button>
                <button type="button" onClick={() => mover(i, 1)} disabled={i === fotos.length - 1}
                  className="btn-ghost text-xs py-0.5 px-2 disabled:opacity-30">→</button>
                <button type="button" onClick={() => onCambio(fotos.filter((_, j) => j !== i))}
                  className="btn-ghost text-xs py-0.5 px-2 text-red-400 hover:text-red-300">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
