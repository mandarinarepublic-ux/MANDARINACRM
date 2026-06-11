'use client'
import { useEffect, useRef, useState } from 'react'

export default function MapaPicker({ onSelect, initialAddress = '' }) {
  const mapRef = useRef(null)
  const inputRef = useRef(null)
  const [map, setMap] = useState(null)
  const [marker, setMarker] = useState(null)
  const [address, setAddress] = useState(initialAddress)
  const [showMap, setShowMap] = useState(false)

  useEffect(() => {
    if (!showMap) return
    if (typeof window === 'undefined' || !window.google) return

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

    // Autocomplete
    const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: 'ec' },
      fields: ['formatted_address', 'geometry'],
    })

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
  }, [showMap])

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
        <input
          ref={inputRef}
          className="input pr-12"
          placeholder="Buscar dirección..."
          value={address}
          onChange={e => setAddress(e.target.value)}
          onFocus={() => setShowMap(true)}
        />
        <button
          type="button"
          onClick={() => setShowMap(!showMap)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-mandarina-400 transition-colors text-lg">
          📍
        </button>
      </div>

      {showMap && (
        <div className="rounded-xl overflow-hidden border border-gray-700">
          <div ref={mapRef} style={{ height: 260, width: '100%' }} />
          <div className="bg-gray-800 px-3 py-2 text-xs text-gray-400 flex items-center gap-2">
            <span>📌</span>
            <span>{address || 'Toca el mapa para seleccionar la dirección'}</span>
          </div>
        </div>
      )}
    </div>
  )
}
