'use client'
import { useState, useCallback } from 'react'
import {
  nuevaCotizacion, nuevoProducto, sumaTallas, shortId,
  numeroWhatsApp, textoWhatsAppCotizacion, ANCHO_DOC_COTIZACION,
  opcionesDe, nuevaOpcion, rangoTotales,
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
  const [cotizacion, setCotizacion] = useState(() => {
    const base = { ...nuevaCotizacion(), ...(initial || {}) }
    // Se normaliza UNA vez, al cargar. De aquí en adelante el estado SIEMPRE
    // tiene `opciones` y ninguna otra parte del hook pregunta por la forma vieja.
    return { ...base, opciones: opcionesDe(base) }
  })
  const [opcionActiva, setOpcionActiva] = useState(0)
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

  /**
   * Cambia los productos de la opción activa.
   *
   * ☠️ Existe para que las seis operaciones de producto no repitan el mismo
   * recorrido: repetirlo es como una de ellas termina escribiendo en la opción
   * equivocada sin que nadie lo note.
   */
  const setProductosActiva = useCallback((fn) => {
    setCotizacion((c) => {
      const opciones = c.opciones.map((o, i) =>
        i === opcionActiva ? { ...o, productos: fn(o.productos) } : o)
      return { ...c, opciones }
    })
  }, [opcionActiva])

  const updProducto = useCallback((id, field, value) => {
    setProductosActiva((ps) => ps.map((p) => (p.id === id ? { ...p, [field]: value } : p)))
  }, [setProductosActiva])

  const updTalla = useCallback((id, talla, qty) => {
    setProductosActiva((ps) => ps.map((p) => {
      if (p.id !== id) return p
      const tallas = { ...p.tallas, [talla]: Math.max(0, Number(qty) || 0) }
      return { ...p, tallas, cantidad: sumaTallas(tallas) }
    }))
  }, [setProductosActiva])

  const toggleTallas = useCallback((id, on) => {
    setProductosActiva((ps) => ps.map((p) => {
      if (p.id !== id) return p
      if (on) return { ...p, conTallas: true, cantidad: sumaTallas(p.tallas) }
      return { ...p, conTallas: false }
    }))
  }, [setProductosActiva])

  const addProducto = useCallback(() => {
    setProductosActiva((ps) => [...ps, nuevoProducto()])
  }, [setProductosActiva])

  const removeProducto = useCallback((id) => {
    setProductosActiva((ps) => (ps.length > 1 ? ps.filter((p) => p.id !== id) : ps))
  }, [setProductosActiva])

  const duplicateProducto = useCallback((id) => {
    setProductosActiva((ps) => {
      const idx = ps.findIndex((p) => p.id === id)
      if (idx < 0) return ps
      const copia = { ...ps[idx], tallas: { ...ps[idx].tallas }, id: shortId() }
      const out = [...ps]
      out.splice(idx + 1, 0, copia)
      return out
    })
  }, [setProductosActiva])

  const addOpcion = useCallback(() => {
    setCotizacion((c) => {
      const letra = String.fromCharCode(65 + c.opciones.length) // A, B, C…
      const opciones = [...c.opciones, nuevaOpcion(`Opción ${letra}`, c.entrega_dias)]
      // La primera vez que se agrega una segunda, la que ya estaba también
      // necesita nombre: si no, el documento pintaría «Opción B» junto a un
      // bloque sin título.
      if (opciones[0] && !opciones[0].nombre) opciones[0] = { ...opciones[0], nombre: 'Opción A' }
      setOpcionActiva(opciones.length - 1)
      return { ...c, opciones }
    })
  }, [])

  const removeOpcion = useCallback((id) => {
    setCotizacion((c) => {
      if (c.opciones.length <= 1) return c // siempre queda al menos una
      const opciones = c.opciones.filter((o) => o.id !== id)
      setOpcionActiva((i) => Math.min(i, opciones.length - 1))
      return { ...c, opciones }
    })
  }, [])

  const updOpcion = useCallback((id, campo, valor) => {
    setCotizacion((c) => ({
      ...c,
      opciones: c.opciones.map((o) => (o.id === id ? { ...o, [campo]: valor } : o)),
    }))
  }, [])

  const rango = rangoTotales(cotizacion)
  // `totales` sigue existiendo: es lo que mira el panel lateral mientras editas,
  // y ahí lo que importa es la opción en la que estás parado.
  const totales = rango.porOpcion[opcionActiva]?.totales || rango.min
  // Los productos de la opción activa: el formulario los pinta directo, sin
  // volver a preguntar por `cotizacion.productos` (esa raíz queda ignorada en
  // cuanto hay `opciones`, ver `opcionesDe` en lib/cotizacion.js).
  const productos = cotizacion.opciones[opcionActiva]?.productos || []

  const save = useCallback(async () => {
    // Una opción sin productos con cantidad y precio saldría en el documento
    // como un bloque de $0. Mejor no dejar guardar que mandarle eso al cliente.
    // ⚠️ Solo aplica cuando hay más de una opción: con una sola, la cotización
    // a medio llenar se tiene que poder guardar como borrador, que es como se
    // trabaja hoy.
    const vacias = cotizacion.opciones
      .map((o, i) => ({ nombre: o.nombre || `Opción ${String.fromCharCode(65 + i)}`, o }))
      .filter(({ o }) => !o.productos.some((p) =>
        (Number(p.cantidad) || 0) > 0 && (parseFloat(String(p.precio)) || 0) > 0))
    if (cotizacion.opciones.length > 1 && vacias.length) {
      showToast(`Sin guardar: ${vacias.map((v) => v.nombre).join(', ')} no tiene productos con cantidad y precio.`)
      setSaving(false)
      return null
    }
    setSaving(true)
    try {
      const payload = {
        ...cotizacion,
        ...rango.guardar,
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
  }, [cotizacion, rango, user, onCreated])

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
      const texto = textoWhatsAppCotizacion(cotizacion, rango.min.total, rango.max.total)
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
  }, [pdfOcupado, armarPdf, nombreArchivo, cotizacion, rango, cambiarEstado])

  return {
    cotizacion, setCotizacion, updCot, setTienda,
    productos,
    opciones: cotizacion.opciones, opcionActiva, setOpcionActiva,
    addOpcion, removeOpcion, updOpcion,
    updProducto, updTalla, toggleTallas,
    addProducto, removeProducto, duplicateProducto,
    totales, rango, mode, setMode, saving, toast, pdfOcupado,
    save, cambiarEstado, exportPDF, compartirWhatsApp,
  }
}
