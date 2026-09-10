'use client'
import { useState, useCallback } from 'react'
import {
  nuevaCotizacion, nuevoProducto, calcTotales, sumaTallas, shortId,
  numeroWhatsApp, textoWhatsAppCotizacion, ANCHO_DOC_COTIZACION, faltantesCotizacion,
} from '@/lib/cotizacion'
import { pdfDeDocumento, dejarPintar } from '@/lib/generarPdf'

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
  // Cuál de los dos botones de salida está trabajando: null | 'guardar' |
  // 'whatsapp'. Es un nombre y no un booleano para que la espera se muestre en
  // el botón que se apretó y no en los dos a la vez. Los DOS se apagan mientras
  // tanto: armar el PDF tarda un par de segundos y dos clics seguidos disparan
  // dos capturas de ~14 MB cada una.
  const [pdfOcupado, setPdfOcupado] = useState(null)
  const [toast, setToast] = useState(null)

  const showToast = (msg, ms = 4000) => {
    setToast(msg)
    setTimeout(() => setToast(null), ms)
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
    // Antes de pedir: el servidor lo rechaza igual, pero un aviso claro acá
    // le ahorra al vendedor el viaje y le dice QUÉ falta.
    const faltan = faltantesCotizacion(cotizacion)
    if (faltan.length) {
      showToast(`⚠️ Para guardar falta ${faltan.join(' y ')}.`, 7000)
      return null
    }
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
      if (!saved) throw new Error('El servidor no devolvió la cotización')
      const eraNueva = !cotizacion.id
      // Número y estado vienen del SERVIDOR: el número lo asigna él al crear
      // (secuencial, único) y el estado puede haberlo pisado el CHECK.
      setCotizacion((c) => ({ ...c, id: saved.id, numero: saved.numero, estado: saved.estado, updated_at: saved.updated_at }))
      showToast(eraNueva ? `✅ Cotización ${saved.numero} creada` : '✅ Cotización guardada')
      if (eraNueva && onCreated) onCreated(saved.id)
      return saved
    } catch (e) {
      showToast('❌ ' + (e.message || 'Error al guardar'))
      return null
    } finally {
      setSaving(false)
    }
  }, [cotizacion, totales, user, onCreated])

  /**
   * Cambia el estado (borrador / enviada / aprobada / rechazada).
   *
   * Si la cotización ya existe se guarda AL INSTANTE, solo ese campo: marcar
   * una como aprobada es una decisión puntual y no puede depender de que
   * después alguien se acuerde de apretar «Guardar». Si todavía no existe, se
   * queda en el estado local y viaja con el POST.
   */
  const cambiarEstado = useCallback(async (estado) => {
    const anterior = cotizacion.estado
    setCotizacion((c) => ({ ...c, estado }))
    if (!cotizacion.id) return true
    try {
      const res = await fetch(`/api/cotizaciones/${cotizacion.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'No se pudo cambiar el estado')
      return true
    } catch (e) {
      // Se vuelve al estado anterior: dejar «Aprobada» en pantalla cuando la
      // base dice «Borrador» es una mentira que se descubre en el historial.
      setCotizacion((c) => ({ ...c, estado: anterior }))
      showToast('❌ ' + (e.message || 'No se pudo cambiar el estado'))
      return false
    }
  }, [cotizacion.id, cotizacion.estado])

  /**
   * Arma el PDF de la cotización tal como se ve en «Vista previa».
   *
   * ⚠️ Antes esto era `setMode('vista')` + `setTimeout(400)` + `window.print()`.
   * O sea que no generaba ningún PDF: le pasaba el documento al navegador y
   * dejaba que él paginara, con sus márgenes, su cabecera y su pie. Por eso una
   * cotización de UNA prenda salía en dos hojas, con la segunda casi vacía.
   *
   * ⚠️ Y los 400 ms eran una apuesta a que React hubiera pintado y las fotos de
   * Cloudinary hubieran bajado. Cuando no, se imprimía la pantalla de EDICIÓN, o
   * el documento sin las fotos de las prendas. Ahora se espera a las dos cosas:
   * `dejarPintar()` al render y `esperarImagenes()` (dentro de `pdfDeDocumento`)
   * a las fotos.
   */
  const armarPdf = useCallback(async () => {
    // ⚠️ Una cotización NUEVA se guarda antes de generar nada: el número lo
    // asigna el servidor al crear, y un PDF sin número —o con «Se asigna al
    // guardar» impreso— no se le puede mandar a nadie. Si guardar falla, el
    // toast ya lo dijo y acá no hay PDF que hacer.
    if (!cotizacion.id) {
      const saved = await save()
      if (!saved) throw new Error('Primero hay que poder guardar la cotización')
    }
    // Se captura la copia OCULTA a ancho fijo (`cot-doc-pdf`, ver
    // CotizacionForm), no el documento visible: el visible mide lo que le
    // deje la pantalla y la barra lateral, y desde un celular salía al 58%
    // de la hoja. La copia se monta mientras `pdfOcupado` está puesto —quien
    // llama lo puso antes de llegar acá— y `dejarPintar` espera a que React
    // la pinte. Ya no hace falta saltar a «Vista previa» para generar.
    await dejarPintar()
    return pdfDeDocumento('cot-doc-pdf', { anchoPx: ANCHO_DOC_COTIZACION })
  }, [cotizacion.id, save])

  const nombreArchivo = useCallback(
    () => `${String(cotizacion.numero || 'cotizacion').trim()}.pdf`,
    [cotizacion.numero],
  )

  const exportPDF = useCallback(async () => {
    if (pdfOcupado) return
    setPdfOcupado('guardar')
    try {
      const { pdf, encaje } = await armarPdf()
      pdf.save(nombreArchivo())
      showToast(`✅ PDF guardado · ${encaje.hojas === 1 ? '1 hoja' : `${encaje.hojas} hojas`}`)
    } catch (e) {
      showToast('❌ ' + (e?.message || 'No se pudo generar el PDF'))
    } finally {
      setPdfOcupado(null)
    }
  }, [pdfOcupado, armarPdf, nombreArchivo])

  /**
   * Compartir la cotización por WhatsApp.
   *
   * Son DOS caminos porque el navegador no siempre puede mandar un archivo:
   *
   *  1. En el celular existe la hoja de compartir del sistema
   *     (`navigator.share` con archivos) y WhatsApp aparece ahí: el PDF va
   *     adjunto de verdad, en un toque.
   *  2. En el escritorio no existe. WhatsApp Web NO acepta archivos por enlace
   *     —`wa.me` solo lleva texto—, así que lo honesto es descargar el PDF y
   *     abrir el chat con el mensaje escrito, para que el vendedor lo adjunte.
   *     Prometer más que eso sería un botón que no hace lo que dice.
   *
   * ⚠️ El PDF sale del MISMO `armarPdf` que el botón de guardar: lo que se
   * comparte es exactamente lo que el vendedor acaba de revisar.
   */
  const compartirWhatsApp = useCallback(async () => {
    if (pdfOcupado) return
    setPdfOcupado('whatsapp')
    try {
      const { pdf } = await armarPdf()
      const nombre = nombreArchivo()
      const texto = textoWhatsAppCotizacion(cotizacion, totales.total)
      const archivo = new File([pdf.output('blob')], nombre, { type: 'application/pdf' })

      if (navigator.canShare?.({ files: [archivo] })) {
        try {
          await navigator.share({ files: [archivo], title: `Cotización ${cotizacion.numero || ''}`.trim(), text: texto })
          // Se compartió DE VERDAD (la hoja del sistema resolvió): pasa a
          // «enviada» sola. Solo desde borrador — una aprobada que se reenvía
          // no vuelve atrás.
          if (cotizacion.estado === 'borrador') await cambiarEstado('enviada')
          showToast('✅ Cotización compartida y marcada como enviada')
          return
        } catch (e) {
          // Cerrar la hoja de compartir NO es un fallo: no hay nada que avisar
          // y menos que arreglar.
          if (e?.name === 'AbortError') return
          // Cualquier otro fallo (permisos, activación vencida en iOS) cae al
          // camino de abajo en vez de dejar al vendedor sin cotización.
        }
      }

      pdf.save(nombre)
      const num = numeroWhatsApp(cotizacion.cliente_tel)
      // Sin número, `wa.me` abre WhatsApp para elegir el contacto a mano. Es
      // mejor que no abrir nada: el vendedor ya tiene el PDF descargado.
      window.open(`https://wa.me/${num}?text=${encodeURIComponent(texto)}`, '_blank')
      // Acá NO se marca como enviada: el vendedor todavía tiene que adjuntar el
      // archivo a mano, y puede no hacerlo. Un estado que dice «enviada» cuando
      // solo se descargó es una mentira, y las mentiras del sistema se aprenden
      // a ignorar. Se le recuerda, que es lo honesto.
      showToast(`📎 PDF descargado (${nombre}). Adjúntalo en el chat que se abrió y, cuando lo mandes, marca la cotización como Enviada.`, 12000)
    } catch (e) {
      showToast('❌ ' + (e?.message || 'No se pudo compartir la cotización'))
    } finally {
      setPdfOcupado(null)
    }
  }, [pdfOcupado, armarPdf, nombreArchivo, cotizacion, totales.total, cambiarEstado])

  return {
    cotizacion, setCotizacion, updCot, setTienda,
    updProducto, updTalla, toggleTallas,
    addProducto, removeProducto, duplicateProducto,
    totales, mode, setMode, saving, toast, pdfOcupado,
    save, cambiarEstado, exportPDF, compartirWhatsApp,
  }
}
