// Carga Google Maps (con Places) SOLO cuando alguien abre el mapa.
//
// POR QUÉ: el <script> de Maps estaba en app/layout.js, o sea que lo bajaban
// TODAS las páginas del CRM —el login, Producción, Impresión en las PCs de
// fábrica, los celulares de los vendedores con datos— y solo lo usa el selector
// de dirección de Nueva Venta (components/maps/MapaPicker.js, detrás de
// "📍 Usar mapa"). Son cientos de KB y varias peticiones por página para nada.
//
// Misma URL, misma key y mismos parámetros que tenía el layout. La CSP del CRM
// (next.config.js) solo define frame-ancestors, así que no hay script-src que
// ajustar; si algún día se agrega uno, tiene que permitir
// https://maps.googleapis.com y https://maps.gstatic.com.
//
// Una sola promesa por pestaña: abrir y cerrar el mapa diez veces no inserta
// diez <script>. Si la carga falla (sin internet), la promesa se olvida para
// que el siguiente intento vuelva a probar en vez de quedarse fallado para
// siempre.

let promesa = null

export function urlGoogleMaps(key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY) {
  return `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`
}

export function cargarGoogleMaps() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Google Maps solo carga en el navegador'))
  // Ya está (otra pantalla lo cargó, o la caché del navegador lo dejó listo).
  if (window.google?.maps?.places) return Promise.resolve(window.google)
  if (promesa) return promesa

  promesa = new Promise((resolve, reject) => {
    const listo = () => {
      if (window.google?.maps?.places) resolve(window.google)
      else { promesa = null; reject(new Error('Google Maps cargó sin Places')) }
    }
    const fallo = () => { promesa = null; reject(new Error('No se pudo cargar Google Maps')) }

    // Si quedó un <script> nuestro a medio cargar (p. ej. tras un fallo), se
    // reutiliza en vez de duplicarlo.
    let s = document.querySelector('script[data-google-maps]')
    if (!s) {
      s = document.createElement('script')
      s.src = urlGoogleMaps()
      s.async = true
      s.defer = true
      s.dataset.googleMaps = '1'
      document.head.appendChild(s)
    }
    s.addEventListener('load', listo, { once: true })
    s.addEventListener('error', () => { s.remove(); fallo() }, { once: true })
  })
  return promesa
}
