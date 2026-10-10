'use client'
// Promo que ve el cliente en mandarinaec.com/pedido. Solo ADMIN.
import { useEffect, useState } from 'react'
import Promo from '@/components/seguimiento/Promo'
import { promoVisible } from '@/lib/seguimientoPublico'
import s from '@/components/seguimiento/seguimiento.module.css'

const VACIA = { activa: false, etiqueta: '', titulo: '', texto: '', codigo: '', link: '' }
const CAMPOS = [
  { k: 'etiqueta', label: 'Etiqueta', ph: '🎁 Promo de octubre' },
  { k: 'titulo',   label: 'Título',   ph: '2x1 en camisetas personalizadas' },
  { k: 'texto',    label: 'Texto',    ph: 'Válido hasta el 31 de octubre en mandarinaec.com' },
  { k: 'codigo',   label: 'Código',   ph: 'MANDI2X1' },
  { k: 'link',     label: 'Link (https://…)', ph: 'https://www.mandarinaec.com/collections/…' },
]

export default function PromoSeguimientoPage() {
  const [promo, setPromo] = useState(VACIA)
  const [estado, setEstado] = useState('CARGANDO') // CARGANDO | LISTO | GUARDANDO | ERROR
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    fetch('/api/promo-seguimiento')
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setPromo(d.promo); setEstado('LISTO') })
      .catch((e) => { setAviso(`No se pudo cargar la promo: ${e.message}`); setEstado('ERROR') })
  }, [])

  async function guardar() {
    setEstado('GUARDANDO'); setAviso('')
    try {
      const r = await fetch('/api/promo-seguimiento', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(promo),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setPromo(d.promo)
      setAviso(d.promo.activa ? '✅ Guardada. Los clientes ya la ven.' : '✅ Guardada. Está apagada: los clientes no la ven.')
      setEstado('LISTO')
    } catch (e) {
      setAviso(`❌ No se guardó: ${e.message}`); setEstado('LISTO')
    }
  }

  const set = (k) => (e) => setPromo((p) => ({ ...p, [k]: e.target.value }))

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Promo del seguimiento</h1>
        <p className="text-sm text-gray-400">Es la que ve el cliente en mandarinaec.com/pedido, arriba de su pedido.</p>
      </div>

      <label className="card p-4 flex items-center justify-between gap-3 cursor-pointer">
        <span className="text-white font-semibold">{promo.activa ? '🟢 Prendida' : '⚪ Apagada'}</span>
        <input id="promo-activa" type="checkbox" className="w-5 h-5" checked={promo.activa}
          onChange={(e) => setPromo((p) => ({ ...p, activa: e.target.checked }))} />
      </label>

      <div className="card p-4 space-y-3">
        {CAMPOS.map((c) => (
          <div key={c.k}>
            <label htmlFor={`promo-${c.k}`} className="block text-xs text-gray-400 mb-1">{c.label}</label>
            <input id={`promo-${c.k}`} className="input w-full" value={promo[c.k]} placeholder={c.ph} onChange={set(c.k)} />
          </div>
        ))}
      </div>

      <div className="card p-4">
        <div className="text-xs text-gray-400 mb-2">Vista previa</div>
        {/* Dentro de .raiz: ahí viven los colores de la promo. */}
        <div className={s.raiz} style={{ minHeight: 0, padding: 16, borderRadius: 12, background: '#e85d04' }}>
          {promoVisible(promo) ? <Promo promo={promo} /> : <div style={{ color: '#fff', fontSize: 14 }}>Apagada o sin título: el cliente no ve ningún recuadro.</div>}
        </div>
      </div>

      {aviso && <div className="text-sm text-white">{aviso}</div>}
      <button className="btn-primary w-full" disabled={estado !== 'LISTO'} onClick={guardar}>
        {estado === 'GUARDANDO' ? 'Guardando…' : 'Guardar'}
      </button>
    </div>
  )
}
