'use client'
import { useEffect, useRef, useState } from 'react'
// Maps ya no viene del layout (lo bajaban todas las páginas): se pide aquí,
// la primera vez que alguien abre el mapa. Ver lib/cargarGoogleMaps.js.
import { cargarGoogleMaps } from '@/lib/cargarGoogleMaps'

export default function MapaPicker({ onSelect, initialAddress = '' }) {
  const mapRef = useRef(null)
  const inputRef = useRef(null)
  const [map, setMap] = useState(null)
  const [marker, setMarker] = useState(null)
  const [address, setAddress] = useState(initialAddress)
  const [showMap, setShowMap] = useState(false)
  // '' = listo o cerrado · 'cargando' · 'error'. Antes, si Maps no había
  // terminado de bajar, el recuadro quedaba gris para siempre sin decir nada.
  const [estadoMapa, setEstadoMapa] = useState('')
  // Un solo Autocomplete por campo: crear uno cada vez que se abría el mapa
  // apilaba listas de sugerencias repetidas sobre el mismo input.
  const autocompleteRef = useRef(null)

  useEffect(() => {
    if (!showMap) return
    let cancelado = false
    setEstadoMapa(window.google?.maps?.places ? '' : 'cargando')
    cargarGoogleMaps()
      .then(() => {
        // Si lo cerraron mientras bajaba, no se pinta nada.
        if (cancelado || !mapRef.current) return
        setEstadoMapa('')
        iniciarMapa()
      })
      .catch(() => { if (!cancelado) setEstadoMapa('error') })
    return () => { cancelado = true }
  }, [showMap])

  function iniciarMapa() {
    const quito = { lat: -0.1807, lng: -78.4678 }
    const m = new window.google.maps.Map(mapRef.current, {
      center: quito,
      zoom: 13,
      styles: [
        { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#38414e' }] },
        { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212a37' }] },
        { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca5b3' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] },
      ],
      disableDefaultUI: true,
      zoomControl: true,
    })

    const mk = new window.google.maps.Marker({
      map: m, draggable: true,
      position: quito,
      icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#FF6B00', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
    })

    mk.addListener('dragend', () => {
      const pos = mk.getPosition()
      geocodeLatLng(pos.lat(), pos.lng(), m)
    })

    m.addListener('click', (e) => {
      mk.setPosition(e.latLng)
      geocodeLatLng(e.latLng.lat(), e.latLng.lng(), m)
    })

    // Autocomplete: se crea una vez; en cada apertura solo se le cambia a qué
    // mapa mueve, porque el mapa sí se crea de nuevo.
    if (!autocompleteRef.current) {
      autocompleteRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: 'ec' },
        fields: ['formatted_address', 'geometry'],
      })
    }
    const autocomplete = autocompleteRef.current
    window.google.maps.event.clearInstanceListeners(autocomplete)

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace()
      if (!place.geometry) return
      const loc = place.geometry.location
      m.setCenter(loc)
      m.setZoom(16)
      mk.setPosition(loc)
      const addr = place.formatted_address
      setAddress(addr)
      onSelect(addr, loc.lat(), loc.lng())
    })

    setMap(m)
    setMarker(mk)
  }

  function geocodeLatLng(lat, lng, m) {
    const geocoder = new window.google.maps.Geocoder()
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === 'OK' && results[0]) {
        const addr = results[0].formatted_address
        setAddress(addr)
        onSelect(addr, lat, lng)
      }
    })
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        {/* Sin etiqueta visible (el formulario ya dice qué es), pero el lector
            de pantalla necesita un nombre: el placeholder no cuenta. */}
        <input
          ref={inputRef}
          className="input pr-12"
          aria-label="Buscar dirección"
          autoComplete="off"
          placeholder="Buscar dirección…"
          value={address}
          onChange={e => setAddress(e.target.value)}
          onFocus={() => setShowMap(true)}
        />
        {/* 40×40 para que se pueda tocar con el dedo; antes medía lo que el emoji. */}
        <button
          type="button"
          onClick={() => setShowMap(!showMap)}
          aria-label={showMap ? 'Ocultar mapa' : 'Mostrar mapa'}
          aria-expanded={showMap}
          title={showMap ? 'Ocultar mapa' : 'Mostrar mapa'}
          className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-lg text-gray-500 hover:text-mandarina-400 transition-colors text-lg">
          <span aria-hidden="true">📍</span>
        </button>
      </div>

      {showMap && (
        <div className="rounded-xl overflow-hidden border border-gray-700">
          <div className="relative">
            <div ref={mapRef} style={{ height: 260, width: '100%' }} />
            {estadoMapa && (
              <div role="status" className="absolute inset-0 flex items-center justify-center bg-gray-900 text-xs text-gray-400 px-4 text-center">
                {estadoMapa === 'cargando'
                  ? 'Cargando mapa…'
                  : 'No se pudo cargar el mapa. Revisa la conexión y vuelve a abrirlo, o escribe la dirección.'}
              </div>
            )}
          </div>
          <div className="bg-gray-800 px-3 py-2 text-xs text-gray-400 flex items-center gap-2">
            <span aria-hidden="true">📌</span>
            <span>{address || 'Toca el mapa para seleccionar la dirección'}</span>
          </div>
        </div>
      )}
    </div>
  )
}
