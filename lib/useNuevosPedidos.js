// Hook que detecta pedidos nuevos comparando contra el último NÚMERO visto.
// Polling cada 60 segundos — sin WebSocket, sin servidor extra.
// Usa /api/pedidos/recientes (liviano: solo EN_FABRICA con áreas), NO la lista
// completa con joins de /api/pedidos, que multiplicaba el consumo de Vercel.
//
// ☠️ Comparaba `PEDIDO_ID` como TEXTO, que ordena por tienda y vendedor antes
// que por número: 509 de 531 pedidos nunca dispararon aviso (96%). La detección
// vive ahora en lib/pedidos-nuevos.js, con pruebas.
import { useEffect, useRef, useCallback } from 'react'
import { detectarNuevos, esRelevante } from '@/lib/pedidos-nuevos'

export function useNuevosPedidos(user, onNuevoPedido) {
  const ultimoNumeroRef = useRef(null)
  const intervalRef = useRef(null)

  const check = useCallback(async () => {
    if (!user) return
    try {
      const res = await fetch('/api/pedidos/recientes')
      // Sin esto, un 401 o un 500 se leían como "no hay pedidos nuevos" y el
      // aviso se apagaba en silencio hasta que alguien recargara.
      if (!res.ok) return
      const data = await res.json()
      const pedidos = (data.pedidos || []).filter(p => p.ESTADO_PEDIDO === 'EN_FABRICA')

      const { nuevos, ultimo } = detectarNuevos(pedidos, ultimoNumeroRef.current)
      if (ultimo !== null) ultimoNumeroRef.current = ultimo

      nuevos.filter(p => esRelevante(p, user)).forEach(p => onNuevoPedido(p))
    } catch (e) {
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
