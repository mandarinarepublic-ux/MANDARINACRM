// lib/areas-usuario.js
//
// Qué prendas le tocan a cada persona del taller.
//
// Esto vivía dentro de app/dashboard/produccion/page.js, donde no se podía probar
// ni reutilizar — y, sobre todo, donde el SERVIDOR no podía verlo. Por eso la
// bandeja se traía las 3.541 filas de la base entera y el celular de David
// descartaba el 95 %.
//
// ⚠️ El área NO sale del rol: sale de `usuarios.areas`. En producción no hay ni un
// usuario con rol SUBLIMACION/ESTAMPADO/BORDADO, aunque los tres existen en
// lib/roles.js y en el menú. El taller entra con rol DISEÑO y sus áreas asignadas:
// David → SUBLIMACION + ESTAMPADO · Christian Garzón → BORDADO.

/** Las tres áreas que se reparten entre la gente del taller. */
export const AREAS_BASE = ['ESTAMPADO', 'SUBLIMACION', 'BORDADO']

const norm = (v) => String(v ?? '').trim().toUpperCase()

/**
 * Áreas cuyas prendas le tocan a este usuario.
 *
 * @param {string} rol    ROL del usuario, tal como lo devuelve getUsuarioById
 * @param {string[]} areas AREAS del usuario (ya como arreglo)
 * @returns {string[]|null} null = las ve TODAS · [] = no ve ninguna
 */
export function areasDeUsuario(rol, areas) {
  const r = norm(rol)

  // CORTE ve todas las prendas a propósito: corta la tela de cualquier área.
  if (r === 'ADMIN' || r === 'CORTE') return null

  const propias = (Array.isArray(areas) ? areas : []).map(norm).filter(Boolean)
  if (propias.length === 1 && propias[0] === 'TODAS') return null
  if (propias.length > 0) return propias.filter((a) => AREAS_BASE.includes(a))

  // Sin áreas asignadas, el rol decide.
  if (AREAS_BASE.includes(r)) return [r]

  // DISEÑO sin áreas no ve nada, y cualquier otro rol tampoco.
  //
  // CAMBIO DELIBERADO respecto a itemEsDeUsuario, que terminaba en `return true`:
  // un VENDEDOR que escribiera /dashboard/produccion a mano veía TODAS las prendas
  // del taller. Ahora no ve ninguna.
  return []
}

/**
 * ¿Esta prenda es de alguna de sus áreas?
 * Una prenda de `ESTAMPADO + BORDADO` cuenta para los dos.
 *
 * @param {string} areaPrenda   el AREA de la prenda
 * @param {string[]|null} areasUsuario  lo que devolvió areasDeUsuario
 */
export function prendaEsDelUsuario(areaPrenda, areasUsuario) {
  const a = norm(areaPrenda)
  if (!a) return false
  if (areasUsuario === null) return true
  return areasUsuario.some((suya) => a.includes(suya))
}
