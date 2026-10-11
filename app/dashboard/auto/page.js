'use client'
// AUTO: el diagrama de los mensajes informativos que recibe el cliente cuando su
// pedido cambia de etapa. Configurable por tienda y por mensaje. Solo ADMIN.
// Por ahora solo se GUARDA: el envío por WhatsApp va en el siguiente paso.
import { useEffect, useRef, useState } from 'react'
import { REGLAS, VARIABLES, rellenar, TEXTO_MAX } from '@/lib/autoMensajes'
import { TIENDAS_SEGUIMIENTO } from '@/lib/tiendasSeguimiento'
import { subirArchivo } from '@/lib/subirImagen'

const TIENDAS = [TIENDAS_SEGUIMIENTO.mandarina, TIENDAS_SEGUIMIENTO.ind]
const COLOR = { mandarina: '#FF6B00', ind: '#E91E8C' }
const ICONO = ['📥', '✏️', '✂️', '🚚', '🎉']

// Lo que acepta WhatsApp (Cloud API): imagen JPG/PNG hasta 5 MB; audio hasta 16 MB.
const ADJUNTO = {
  imagen: { accept: 'image/jpeg,image/png', max: 5, tipos: /^image\/(jpeg|png)$/ },
  audio: { accept: 'audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/amr,.mp3,.m4a,.aac,.ogg,.amr', max: 16, tipos: /^audio\// },
}

const ejemplo = (t) => ({
  nombre: 'Ana',
  pedido: t.clave === 'ind' ? 'IND-XAV-6302' : 'MAN-JAC-6308',
  guia: 'Servientrega 123456789',
  link: `${t.web.replace(/^https:\/\/(www\.)?/, '')}/pedido`,
})

function Interruptor({ prendido, onChange, disabled, color }) {
  return (
    <button type="button" role="switch" aria-checked={prendido} disabled={disabled} onClick={() => onChange(!prendido)}
      className="relative w-14 h-8 rounded-full transition-colors flex-none disabled:opacity-50"
      style={{ background: prendido ? color : '#374151' }}>
      <span className="absolute top-1 w-6 h-6 rounded-full bg-white transition-all" style={{ left: prendido ? 28 : 4 }} />
      <span className="sr-only">{prendido ? 'Prendido' : 'Apagado'}</span>
    </button>
  )
}

function Tarjeta({ m, t, ultimo, onGuardado }) {
  const [texto, setTexto] = useState(m.texto)
  const [estado, setEstado] = useState('') // '' | GUARDANDO | SUBIENDO
  const [aviso, setAviso] = useState('')
  const archivo = useRef(null)
  const [tipoSubida, setTipoSubida] = useState('imagen')
  const color = COLOR[t.clave]
  const cambiado = texto.trim() !== m.texto

  useEffect(() => { setTexto(m.texto) }, [m.texto])

  async function guardar(cambios, okMsg) {
    setEstado('GUARDANDO'); setAviso('')
    try {
      const r = await fetch('/api/auto', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...m, texto, ...cambios }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      onGuardado(d.mensaje)
      setAviso(okMsg)
    } catch (e) {
      setAviso(`❌ ${e.message}`)
    } finally {
      setEstado('')
    }
  }

  async function subir(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const regla = ADJUNTO[tipoSubida]
    if (!regla.tipos.test(f.type)) { setAviso(`❌ Ese archivo no es ${tipoSubida === 'imagen' ? 'una imagen JPG o PNG' : 'un audio'}.`); return }
    if (f.size > regla.max * 1024 * 1024) { setAviso(`❌ Pesa más de ${regla.max} MB, WhatsApp no lo acepta.`); return }
    setEstado('SUBIENDO'); setAviso('')
    try {
      const url = await subirArchivo(f, 'auto')
      await guardar({ media_url: url, media_tipo: tipoSubida }, '✅ Adjunto guardado.')
    } catch (err) {
      setAviso(`❌ ${err.message}`); setEstado('')
    }
  }

  const ocupado = estado !== ''
  return (
    <div className="relative pl-12">
      {/* La línea del diagrama */}
      {!ultimo && <div className="absolute left-[19px] top-10 bottom-[-24px] w-0.5" style={{ background: `${color}55` }} />}
      <div className="absolute left-0 top-1 w-10 h-10 rounded-full grid place-items-center text-lg border-2"
        style={{ borderColor: color, background: m.activo ? color : '#111827' }}>{ICONO[m.etapa]}</div>

      <div className="card p-4 space-y-3" style={{ borderColor: m.activo ? color : undefined }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-gray-400">Mensaje {m.etapa + 1} de 5</div>
            <h2 className="text-lg font-bold text-white">{m.nombre}</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold ${m.activo ? 'text-white' : 'text-gray-500'}`}>{m.activo ? 'PRENDIDO' : 'APAGADO'}</span>
            <Interruptor prendido={m.activo} color={color} disabled={ocupado}
              onChange={(v) => guardar({ activo: v }, v ? '✅ Prendido.' : '✅ Apagado.')} />
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-400 mb-1">Se manda cuando:</div>
          <div className="flex flex-wrap gap-1.5">
            {m.disparadores.map((d) => (
              <span key={d} className="text-xs rounded-full px-2.5 py-1 bg-gray-800 text-gray-200 border border-gray-700">{d}</span>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor={`auto-${m.etapa}`} className="block text-xs text-gray-400 mb-1">Texto</label>
          <textarea id={`auto-${m.etapa}`} className="input w-full" rows={3} maxLength={TEXTO_MAX}
            value={texto} onChange={(e) => setTexto(e.target.value)} />
          <div className="flex justify-between text-[11px] text-gray-500 mt-1">
            <span>{texto.length}/{TEXTO_MAX}</span>
            {cambiado && <span className="text-amber-400">Sin guardar</span>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {m.media_url ? (
            <div className="flex items-center gap-3 w-full">
              {m.media_tipo === 'imagen'
                ? <img src={m.media_url} alt="Imagen adjunta" className="w-24 h-24 object-cover rounded-lg border border-gray-700" />
                : <audio controls src={m.media_url} className="flex-1 min-w-0" />}
              <button type="button" className="text-xs text-red-400 hover:text-red-300" disabled={ocupado}
                onClick={() => guardar({ media_url: null, media_tipo: null }, '✅ Adjunto quitado.')}>Quitar</button>
            </div>
          ) : (
            <>
              <span className="text-xs text-gray-400">Adjuntar:</span>
              {['imagen', 'audio'].map((tipo) => (
                <button key={tipo} type="button" disabled={ocupado}
                  className="text-xs rounded-lg px-3 py-1.5 bg-gray-800 text-gray-200 border border-gray-700 hover:border-gray-500"
                  onClick={() => { setTipoSubida(tipo); setTimeout(() => archivo.current?.click(), 0) }}>
                  {tipo === 'imagen' ? '🖼️ Imagen' : '🎙️ Audio'}
                </button>
              ))}
              <input ref={archivo} type="file" className="hidden" accept={ADJUNTO[tipoSubida].accept} onChange={subir} />
            </>
          )}
        </div>

        {m.media_tipo === 'audio' && (
          <p className="text-[11px] text-amber-400">🎙️ El audio solo sale si el cliente escribió hace poco (24 h, o 7 días si vino por pauta). Si no, va solo el texto.</p>
        )}

        {/* Vista previa tipo WhatsApp */}
        <div className="rounded-lg p-3" style={{ background: '#0b141a' }}>
          <div className="max-w-[85%] ml-auto rounded-lg p-2 text-sm whitespace-pre-line" style={{ background: '#005c4b', color: '#e9edef' }}>
            {m.media_tipo === 'imagen' && m.media_url && <img src={m.media_url} alt="" className="rounded mb-1.5 max-h-40 w-full object-cover" />}
            {m.media_tipo === 'audio' && <div className="text-xs mb-1 opacity-80">🎙️ Nota de voz</div>}
            {rellenar(texto, ejemplo(t))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-gray-300 min-h-[1rem]">{estado === 'SUBIENDO' ? 'Subiendo…' : aviso}</span>
          <button type="button" className="btn-primary text-sm px-4 py-2" disabled={ocupado || !cambiado || !texto.trim()}
            onClick={() => guardar({}, '✅ Texto guardado.')}>
            {estado === 'GUARDANDO' ? 'Guardando…' : 'Guardar texto'}
          </button>
        </div>
        {m.actualizado_en && (
          <div className="text-[11px] text-gray-500">
            Último cambio: {new Date(m.actualizado_en).toLocaleString('es-EC', { timeZone: 'America/Guayaquil' })}{m.actualizado_por ? ` · ${m.actualizado_por}` : ''}
          </div>
        )}
      </div>
    </div>
  )
}

export default function AutoPage() {
  const [tienda, setTienda] = useState('mandarina')
  const [mensajes, setMensajes] = useState([])
  const [estado, setEstado] = useState('CARGANDO')
  const [error, setError] = useState('')
  const t = TIENDAS_SEGUIMIENTO[tienda]

  useEffect(() => {
    let vivo = true
    setEstado('CARGANDO'); setError('')
    fetch(`/api/auto?tienda=${tienda}`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); if (vivo) { setMensajes(d.mensajes); setEstado('LISTO') } })
      .catch((e) => { if (vivo) { setError(e.message); setEstado('ERROR') } })
    return () => { vivo = false }
  }, [tienda])

  const prendidos = mensajes.filter((m) => m.activo).length
  const actualizar = (nuevo) => setMensajes((ms) => ms.map((m) => (m.etapa === nuevo.etapa ? nuevo : m)))

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">AUTO · Mensajes informativos</h1>
        <p className="text-sm text-gray-400">Lo que recibe el cliente por WhatsApp cuando su pedido cambia de etapa. Cada mensaje se prende y apaga por su cuenta.</p>
      </div>

      <div className="flex gap-2">
        {TIENDAS.map((x) => (
          <button key={x.clave} type="button" onClick={() => setTienda(x.clave)}
            className="flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
            style={tienda === x.clave ? { background: COLOR[x.clave], color: '#fff' } : { background: '#1f2937', color: '#d1d5db' }}>
            {x.nombre}
          </button>
        ))}
      </div>

      <div className="card p-4 space-y-2">
        <div className="text-sm font-semibold text-white">📋 Reglas</div>
        <ul className="text-xs text-gray-300 space-y-1 list-disc pl-4">
          {REGLAS.map((r) => <li key={r}>{r}</li>)}
        </ul>
        <div className="text-xs text-gray-400 pt-1">
          Puedes usar: {VARIABLES.map(([v, d]) => <span key={v} className="inline-block mr-2"><code className="text-gray-200">{v}</code> {d}</span>)}
        </div>
        <div className="text-xs rounded-md px-3 py-2 bg-amber-500/10 border border-amber-500/30 text-amber-300">
          ⚠️ Todavía no se envía nada: aquí se deja listo cada mensaje. El envío por WhatsApp se activa en el siguiente paso.
        </div>
      </div>

      {estado === 'CARGANDO' && <div className="text-sm text-gray-400">Cargando…</div>}
      {estado === 'ERROR' && <div className="text-sm text-red-400">No se pudo cargar: {error}</div>}
      {estado === 'LISTO' && (
        <>
          <div className="text-sm text-gray-300">{t.nombre}: <b className="text-white">{prendidos} de 5</b> mensajes prendidos</div>
          <div className="space-y-6">
            {mensajes.map((m, k) => (
              <Tarjeta key={`${tienda}-${m.etapa}`} m={m} t={t} ultimo={k === mensajes.length - 1} onGuardado={actualizar} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
