'use client'
import { useState, useCallback } from 'react'
import {
  nuevaCotizacion, nuevoProducto, calcTotales, sumaTallas, shortId,
} from '@/lib/cotizacion'

// Hook con TODA la lógica de estado de una cotización.
// Guarda vía fetch a /api/cotizaciones (el navegador NUNCA toca Supabase directo;
// el service_role vive solo en el server, lib/supabase.js).
//
// @param initial  cotización existente (para editar) o undefined (nueva)
// @param user     sesión { id, nombre, rol } de localStorage
// @param onCreated callback(id) tras crear una nueva (para navegar a /[id])
export function useCotizacion(initial, user, onCreated) {
  const [cotizacion, setCotizacion] = useState(() => ({
    ...nuevaCotizacion(),
    ...(initial || {}),
    // productos siempre array con al menos uno
    productos: (initial?.productos?.length ? initial.productos : nuevaCotizacion().productos),
  }))
  const [mode, setMode] = useState('edicion') // 'edicion' | 'vista'
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  const updCot = useCallback((field, value) => {
    setCotizacion((c) => ({ ...c, [field]: value }))
  }, [])

  const setTienda = useCallback((tienda) => {
    setCotizacion((c) => ({ ...c, tienda }))
  }, [])

  const updProducto = useCallback((id, field, value) => {
    setCotizacion((c) => ({
      ...c,
      productos: c.productos.map((p) => (p.id === id ? { ...p, [field]: value } : p)),
    }))
  }, [])

  const updTalla = useCallback((id, talla, qty) => {
    setCotizacion((c) => ({
      ...c,
      productos: c.productos.map((p) => {
        if (p.id !== id) return p
        const tallas = { ...p.tallas, [talla]: Math.max(0, Number(qty) || 0) }
        return { ...p, tallas, cantidad: sumaTallas(tallas) }
      }),
    }))
  }, [])

  const toggleTallas = useCallback((id, on) => {
    setCotizacion((c) => ({
      ...c,
      productos: c.productos.map((p) => {
        if (p.id !== id) return p
        if (on) return { ...p, conTallas: true, cantidad: sumaTallas(p.tallas) }
        return { ...p, conTallas: false }
      }),
    }))
  }, [])

  const addProducto = useCallback(() => {
    setCotizacion((c) => ({ ...c, productos: [...c.productos, nuevoProducto()] }))
  }, [])

  const removeProducto = useCallback((id) => {
    setCotizacion((c) => ({
      ...c,
      productos: c.productos.length > 1 ? c.productos.filter((p) => p.id !== id) : c.productos,
    }))
  }, [])

  const duplicateProducto = useCallback((id) => {
    setCotizacion((c) => {
      const orig = c.productos.find((p) => p.id === id)
      if (!orig) return c
      const idx = c.productos.findIndex((p) => p.id === id)
      const copia = { ...orig, tallas: { ...orig.tallas }, id: shortId() }
      const productos = [...c.productos]
      productos.splice(idx + 1, 0, copia)
      return { ...c, productos }
    })
  }, [])

  const totales = calcTotales(cotizacion.productos, cotizacion.descuento)

  const save = useCallback(async () => {
    setSaving(true)
    try {
      const payload = {
        ...cotizacion,
        subtotal: +totales.subtotal.toFixed(2),
        iva_monto: +totales.iva.toFixed(2),
        total: +totales.total.toFixed(2),
        created_by: cotizacion.created_by || user?.id || null,
        created_by_nombre: cotizacion.created_by_nombre || user?.nombre || null,
      }
      let res, data
      if (cotizacion.id) {
        res = await fetch(`/api/cotizaciones/${cotizacion.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch('/api/cotizaciones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }
      data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Error al guardar')
      const saved = data.cotizacion
      if (saved) {
        const eraNueva = !cotizacion.id
        setCotizacion((c) => ({ ...c, id: saved.id, updated_at: saved.updated_at }))
        showToast('✅ Cotización guardada')
        if (eraNueva && onCreated) onCreated(saved.id)
      }
    } catch (e) {
      showToast('❌ ' + (e.message || 'Error al guardar'))
    } finally {
      setSaving(false)
    }
  }, [cotizacion, totales, user, onCreated])

  const exportPDF = useCallback(() => {
    setMode('vista')
    setTimeout(() => window.print(), 400)
  }, [])

  return {
    cotizacion, setCotizacion, updCot, setTienda,
    updProducto, updTalla, toggleTallas,
    addProducto, removeProducto, duplicateProducto,
    totales, mode, setMode, saving, toast,
    save, exportPDF,
  }
}
