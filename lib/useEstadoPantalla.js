'use client'
// lib/useEstadoPantalla.js
//
// El estado de una bandeja (filtros, paginación, scroll) que sobrevive a que la
// pantalla se remonte. Ver lib/estado-pantalla.js para el porqué y la caducidad.
//
// ⚠️ Se lee DESPUÉS de montar, nunca durante el render: en el render manda el
// servidor, donde `localStorage` no existe, y devolver valores distintos en
// cliente y servidor rompe la hidratación de React.
import { useCallback, useEffect, useRef, useState } from 'react'
import { almacenLocal, guardar, leer, hayFiltro } from './estado-pantalla'

// Lo que NO es filtro: restaurarlo no puede esconder un pedido, así que no
// enciende el aviso.
const NO_SON_FILTRO = ['visibles', 'scroll', 'expandidos']

/**
 * @param {string} pantalla    clave estable ('despacho', 'produccion'…)
 * @param {object} porDefecto  el estado con el que arranca la pantalla
 * @param {object} [opciones]
 * @param {string[]} [opciones.noSonFiltro]  claves que no encienden el aviso
 * @param {object} [opciones.alFiltrar]  qué se reinicia al cambiar un filtro
 *   (típicamente `{ visibles: 20, scroll: 0 }`: si filtras, la paginación y la
 *   posición anteriores ya no significan nada)
 */
export function useEstadoPantalla(pantalla, porDefecto, opciones = {}) {
  // En refs para que los efectos no dependan de objetos que se recrean en cada
  // render (y acaben corriendo en bucle).
  const porDefectoRef = useRef(porDefecto)
  const noFiltroRef = useRef(opciones.noSonFiltro || NO_SON_FILTRO)
  const alFiltrarRef = useRef(opciones.alFiltrar || {})

  const [valores, setValores] = useState(porDefecto)
  const [restaurado, setRestaurado] = useState(false)
  const [avisoFiltro, setAvisoFiltro] = useState(false)

  useEffect(() => {
    const guardado = leer(almacenLocal(), pantalla)
    if (guardado) {
      const combinado = { ...porDefectoRef.current, ...guardado }
      setValores(combinado)
      // Solo se avisa si lo restaurado ESCONDE algo. Volver al mismo scroll no
      // necesita cartel; volver con una fecha puesta sí.
      setAvisoFiltro(hayFiltro(combinado, porDefectoRef.current, noFiltroRef.current))
    }
    setRestaurado(true)
  }, [pantalla])

  useEffect(() => {
    // Hasta no haber leído, escribir pisaría lo guardado con los valores por
    // defecto — y el usuario perdería justo lo que veníamos a devolverle.
    if (!restaurado) return
    guardar(almacenLocal(), pantalla, valores)
  }, [pantalla, restaurado, valores])

  /** Cambia un valor cualquiera (paginación, scroll, un panel abierto…). */
  const set = useCallback((campo, valor) => {
    setValores((v) => ({ ...v, [campo]: typeof valor === 'function' ? valor(v[campo]) : valor }))
  }, [])

  /**
   * Cambia un FILTRO. Reinicia de paso lo que el filtro invalida.
   *
   * ☠️ Esto era un `useEffect(() => setVisibles(20), [busqueda, ...])`. Al
   * restaurar, los filtros pasan de vacíos a puestos y ese efecto se disparaba
   * solo, borrando la paginación que acabábamos de devolver.
   */
  const setFiltro = useCallback((campo, valor) => {
    setValores((v) => ({
      ...v,
      [campo]: typeof valor === 'function' ? valor(v[campo]) : valor,
      ...alFiltrarRef.current,
    }))
  }, [])

  const limpiarFiltros = useCallback(() => {
    setValores({ ...porDefectoRef.current })
    setAvisoFiltro(false)
  }, [])

  const ocultarAviso = useCallback(() => setAvisoFiltro(false), [])

  return { valores, set, setFiltro, setValores, restaurado, avisoFiltro, ocultarAviso, limpiarFiltros }
}

/**
 * Quién scrollea de verdad: el contenedor o la ventana.
 *
 * ☠️ MEDIDO EN PRODUCCIÓN el 26-ago-2026, no deducido del código. El contenedor
 * `flex-1 overflow-y-auto` de las bandejas da `scrollHeight === clientHeight`
 * en escritorio: crece con el contenido y quien se mueve es la VENTANA
 * (`window.scrollY` marcaba 800 mientras el contenedor marcaba 0). Enganchar el
 * listener solo al contenedor guardaba siempre cero — el filtro volvía y la
 * posición no. En pantallas angostas el que scrollea sí puede ser el contenedor,
 * así que no se elige de una vez: se pregunta cada vez.
 *
 * Ninguna prueba de fuente puede ver esto; hace falta un navegador de verdad.
 */
function scrollador(el) {
  const propio = el && el.scrollHeight > el.clientHeight + 1
  return {
    donde: () => (propio ? el.scrollTop : window.scrollY || document.documentElement.scrollTop || 0),
    ir: (y) => (propio ? (el.scrollTop = y) : window.scrollTo(0, y)),
  }
}

/**
 * Devuelve el scroll al sitio donde estaba.
 *
 * @param {object} ref       el contenedor con overflow-y-auto
 * @param {number} guardado  la posición que había
 * @param {function} onCambio  recibe la posición nueva (va al estado guardado)
 * @param {boolean} listo    solo se restaura cuando la lista YA está pintada:
 *                           con el contenedor vacío `scrollTop = 900` se queda en 0
 */
export function useScrollGuardado(ref, guardado, onCambio, listo) {
  const yaRestaurado = useRef(false)
  const ultimo = useRef(null)
  const inicial = useRef(guardado)
  inicial.current = yaRestaurado.current ? inicial.current : guardado

  // ⚠️ `onCambio` llega como flecha nueva en cada render. Si el efecto dependiera
  // de ella se desmontaría y volvería a montar el listener constantemente — y su
  // limpieza cancela el temporizador, así que un guardado pendiente se perdía si
  // algo volvía a renderizar dentro de esos 400 ms.
  const onCambioRef = useRef(onCambio)
  onCambioRef.current = onCambio

  useEffect(() => {
    if (!listo || yaRestaurado.current) return
    yaRestaurado.current = true
    const y = inicial.current
    if (!y) return
    // Dos cuadros: el primero monta la lista, el segundo ya tiene su altura.
    const id = requestAnimationFrame(() => requestAnimationFrame(() => {
      scrollador(ref.current).ir(y)
    }))
    return () => cancelAnimationFrame(id)
  }, [ref, listo])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let temporizador = null

    // Se anota en cada scroll pero solo se GUARDA cuando para. Escribir en
    // localStorage en cada cuadro trababa el scroll en el celular.
    const volcar = () => { if (ultimo.current !== null) onCambioRef.current(ultimo.current) }
    const alScroll = () => {
      ultimo.current = scrollador(el).donde()
      clearTimeout(temporizador)
      temporizador = setTimeout(volcar, 400)
    }
    // Si el navegador se lleva la pestaña, no hay 400 ms que esperar: se vuelca ya.
    const alIrse = () => { clearTimeout(temporizador); volcar() }

    // Los DOS: cuál de ellos se mueve depende del ancho de la pantalla, y aquí
    // todavía no se sabe. Escuchar solo uno es apostar.
    el.addEventListener('scroll', alScroll, { passive: true })
    window.addEventListener('scroll', alScroll, { passive: true })
    window.addEventListener('pagehide', alIrse)
    document.addEventListener('visibilitychange', alIrse)
    return () => {
      clearTimeout(temporizador)
      el.removeEventListener('scroll', alScroll)
      window.removeEventListener('scroll', alScroll)
      window.removeEventListener('pagehide', alIrse)
      document.removeEventListener('visibilitychange', alIrse)
    }
  }, [ref])
}
