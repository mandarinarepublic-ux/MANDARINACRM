// Hook que detecta pedidos nuevos comparando contra el último ID visto
// Polling cada 60 segundos — sin WebSocket, sin servidor extra
// Usa /api/pedidos/recientes (liviano: solo EN_FABRICA con áreas), NO la lista
// completa con joins de /api/pedidos, que multiplicaba el consumo de Vercel.
import { useEffect, useRef, useCallback } from 'react'

export function useNuevosPedidos(user, onNuevoPedido) {
  const ultimoIdRef = useRef(null)
  const intervalRef = useRef(null)

  const check = useCallback(async () => {
    if (!user) return
    try {
      const res = await fetch('/api/pedidos/recientes')
      const data = await res.json()
      const pedidos = (data.pedidos || [])
        .filter(p => p.ESTADO_PEDIDO === 'EN_FABRICA')
        .sort((a, b) => b.PEDIDO_ID.localeCompare(a.PEDIDO_ID))

      if (pedidos.length === 0) return

      const masReciente = pedidos[0]

      // Primera carga: solo guardar referencia, sin notificar
      if (ultimoIdRef.current === null) {
        ultimoIdRef.current = masReciente.PEDIDO_ID
        return
      }

      // Si el ID más reciente cambió, hay pedido(s) nuevo(s)
      if (masReciente.PEDIDO_ID !== ultimoIdRef.current) {
        const nuevos = []
        for (const p of pedidos) {
          if (p.PEDIDO_ID === ultimoIdRef.current) break
          const areas = (p.items || []).map(i => (i.AREA || '').toUpperCase())
          const esRelevante = (() => {
            if (['ADMIN', 'CORTE', 'DISEÑO'].includes(user.rol)) return true
            if (user.rol === 'BORDADO')     return areas.some(a => a.includes('BORDADO'))
            if (user.rol === 'ESTAMPADO')   return areas.some(a => a.includes('ESTAMPADO'))
            if (user.rol === 'SUBLIMACION') return areas.some(a => a.includes('SUBLIMACION'))
            // Por areas del usuario
            const uAreas = user.areas || []
            return uAreas.some(ua => areas.some(a => a.includes(ua)))
          })()
          if (esRelevante) nuevos.push(p)
        }
        ultimoIdRef.current = masReciente.PEDIDO_ID
        nuevos.forEach(p => onNuevoPedido(p))
      }
    } catch(e) {
      console.error('Polling error:', e)
    }
  }, [user, onNuevoPedido])

  useEffect(() => {
    if (!user) return
    const rolesConNotif = ['ADMIN','BORDADO','ESTAMPADO','SUBLIMACION','DISEÑO','CORTE']
    if (!rolesConNotif.includes(user.rol)) return
    check()
    intervalRef.current = setInterval(check, 60000)
    return () => clearInterval(intervalRef.current)
  }, [user, check])
}
