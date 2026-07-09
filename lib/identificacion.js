// Tipos de identificación del cliente (código = tipo_identificacion del SRI/Dátil)
// Compartido entre Nueva Venta y Editar Pedido.
export const TIPOS_ID = [
  { key: 'CEDULA',    label: 'Cédula',    codigo: '05', placeholder: '1712345678',    inputMode: 'numeric', factura: true },
  { key: 'RUC',       label: 'RUC',       codigo: '04', placeholder: '1712345678001', inputMode: 'numeric', factura: true },
  { key: 'PASAPORTE', label: 'Pasaporte', codigo: '06', placeholder: 'AB123456',      inputMode: 'text',    factura: false },
]

export const tipoIdMeta = (key) => TIPOS_ID.find(t => t.key === key) || TIPOS_ID[0]

// Validación del dígito verificador de la cédula ecuatoriana (10 dígitos)
export function validarCedula10(v) {
  const prov = parseInt(v.substring(0, 2))
  if (prov < 1 || prov > 24) return 'Provincia inválida'
  const d = v.split('').map(Number)
  let suma = 0
  for (let i = 0; i < 9; i++) {
    let val = d[i] * (i % 2 === 0 ? 2 : 1)
    if (val > 9) val -= 9
    suma += val
  }
  const ver = suma % 10 === 0 ? 0 : 10 - (suma % 10)
  if (ver !== d[9]) return 'Cédula inválida'
  return null
}

// Validación según el tipo seleccionado. Devuelve mensaje de error o null.
export function validarIdentificacion(tipo, v) {
  const val = String(v || '').trim()
  if (!val) return 'Requerido'
  if (tipo === 'CEDULA') {
    if (!/^\d{10}$/.test(val)) return 'La cédula debe tener 10 dígitos'
    return validarCedula10(val)
  }
  if (tipo === 'RUC') {
    if (!/^\d{13}$/.test(val)) return 'El RUC debe tener 13 dígitos'
    if (val.substring(10) !== '001') return 'RUC debe terminar en 001'
    return null
  }
  if (tipo === 'PASAPORTE') {
    if (!/^[A-Za-z0-9-]{3,20}$/.test(val)) return 'Pasaporte: 3 a 20 caracteres (letras/números)'
    return null
  }
  return null
}

// Inferir el tipo desde un identificador ya guardado (cliente reutilizado/editado)
export function inferirTipo(idStr) {
  const s = String(idStr || '').trim()
  if (/^\d{13}$/.test(s)) return 'RUC'
  if (/^\d{10}$/.test(s)) return 'CEDULA'
  if (s && !/^\d+$/.test(s)) return 'PASAPORTE'
  return 'CEDULA'
}
