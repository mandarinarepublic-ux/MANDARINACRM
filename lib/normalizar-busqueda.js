// lib/normalizar-busqueda.js
//
// Deja un texto como lo guarda la columna generada `crm.clientes.busqueda`:
// minúsculas, sin tildes y sin la ñ.
//
// ☠️ LOS DOS LADOS TIENEN QUE COINCIDIR. Postgres normalizó lo que está
// GUARDADO; esto normaliza lo que TECLEA el vendedor. Si se separan, la
// búsqueda deja de encontrar y nadie se entera: no hay error, solo cero
// resultados — que es exactamente como se ve un cliente que no existe.
//
// La definición de la base es:
//   translate(lower(nombre), 'áéíóúñÁÉÍÓÚÑ', 'aeiounaeioun')
//
// Vive aparte y sin dependencias para que `node --test` pueda importarlo: el
// repo de clientes arrastra `sheets` y `supabase`, y ninguno resuelve en ESM.

export function normalizarBusqueda(valor) {
  return String(valor ?? '')
    .toLowerCase()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i')
    .replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u').replace(/ñ/g, 'n');
}
