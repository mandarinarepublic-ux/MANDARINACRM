'use client'

// ─── Skeletons de carga ───────────────────────────────────────────────────────
// Placeholders gris con la forma real de las tarjetas. Se sienten más rápidos
// que un spinner porque el usuario ya ve la estructura mientras Sheets responde.

// Una tarjeta de pedido (misma forma que el Link del historial)
export function SkeletonCard() {
  return (
    <div className="card p-4 flex items-center gap-4 animate-pulse">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-4 w-20 bg-gray-800 rounded" />
          <div className="h-4 w-4 bg-gray-800 rounded-full" />
        </div>
        <div className="h-3 w-36 bg-gray-800 rounded" />
      </div>
      <div className="flex flex-col items-end gap-2">
        <div className="h-5 w-24 bg-gray-800 rounded-full" />
        <div className="h-5 w-16 bg-gray-800 rounded-full" />
      </div>
    </div>
  )
}

// Lista de skeletons (usar mientras loading === true)
export function SkeletonList({ count = 6 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  )
}

// KPI / stat genérico (por si lo quieres usar en dashboards)
export function SkeletonStat() {
  return (
    <div className="card p-4 animate-pulse">
      <div className="h-7 w-16 bg-gray-800 rounded mb-2" />
      <div className="h-3 w-20 bg-gray-800 rounded mb-1" />
      <div className="h-3 w-12 bg-gray-800 rounded" />
    </div>
  )
}
