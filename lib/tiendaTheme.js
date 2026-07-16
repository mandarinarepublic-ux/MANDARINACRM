// lib/tiendaTheme.js — Sistema visual por tienda para las Cotizaciones.
// El documento del cliente (CotizacionPreview) cambia color y logo según la tienda.

export const tiendaTheme = {
  mandarina: {
    accent: '#FF6B00',
    accentHover: '#ea580c',
    accentLight: '#fff3e8',
    accentBorder: '#ffd9bc',
    accentText: '#c2410c',
    gradient: 'linear-gradient(135deg, #FF6B00 0%, #ea580c 100%)',
    logo: '/logos/logo_mandarina.png',
    nombre: 'Mandarina Republic',
    tagline: 'Personalización textil con identidad',
    emoji: '🍊',
    web: 'www.mandarinarepublic.com',
    telefono: '+593 99 000 0000',
  },
  indstore: {
    accent: '#E91E8C',
    accentHover: '#c2185b',
    accentLight: '#fce4ec',
    accentBorder: '#f8bbd0',
    accentText: '#880e4f',
    gradient: 'linear-gradient(135deg, #E91E8C 0%, #c2185b 100%)',
    logo: '/logos/logo_indstore.png',
    nombre: 'Ind Store',
    tagline: 'Prendas personalizadas',
    emoji: '🏪',
    web: 'www.indstore.ec',
    telefono: '+593 99 000 0000',
  },
}

export function themeFor(tienda) {
  return tiendaTheme[tienda] || tiendaTheme.mandarina
}
