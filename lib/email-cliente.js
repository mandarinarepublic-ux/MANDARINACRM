// lib/email-cliente.js
//
// El email del cliente se guardaba TAL CUAL lo escribían. Medido el 21-ago-2026:
// 28 clientes con espacios EN MEDIO del correo ("juanpa_1994@hot mail.com",
// "edro27@hotmail. com", "ariel 31 rodriguez 2005 @gmail.com"). Eran 25 el
// 14-ago, o sea que siguen entrando.
//
// Cada uno es una factura de Dátil que falla. Y falla DESPUÉS de la venta, así
// que nadie se entera en el momento.
//
// De los 28, a 26 les bastaba con quitarles los espacios. Por eso se limpia al
// guardar: es mecánico y no puede equivocarse.
//
// ⚠️ NO se bloquea la venta por un email raro. Un correo mal escrito es un
// problema de facturación; frenar el pedido por eso sería mucho peor. Para eso
// está `emailPareceValido`: para AVISAR, no para impedir.
//
// Vive aparte y sin dependencias para que `node --test` pueda importarlo.

/**
 * Deja el correo como debería haberse escrito: sin espacios (ni en medio) y en
 * minúsculas. No adivina dominios — "yahoo com" no se convierte en "yahoo.com",
 * porque eso ya sería inventar.
 */
export function limpiarEmail(email) {
  if (email === undefined || email === null) return email;
  // \s cubre el espacio normal, el tabulador y también el NBSP que pega el móvil.
  return String(email).replace(/[\s ]+/g, '').toLowerCase();
}

/** ¿Tiene forma de correo? Un solo @, algo antes, y un dominio con punto. */
export function emailPareceValido(email) {
  const e = limpiarEmail(email) || '';
  if (!e) return false;
  return /^[^@]+@[^@]+\.[a-z]{2,}$/.test(e);
}
