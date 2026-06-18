# Quick Wins — Mandarina Pro (copiar y pegar)

5 mejoras de usabilidad listas para producción. Todo respeta tu stack actual
(Next.js 14 App Router + Tailwind, clases `card` / `input` / `btn-primary`,
`mp_user` en localStorage). **No** requiere instalar librerías nuevas.

## Qué incluye

| # | Mejora | Archivo |
|---|--------|---------|
| 1 | Historial paginado (tandas de 30, botón "Cargar más") | `app/dashboard/historial/page.js` *(reemplaza)* |
| 2 | Skeletons de carga (en vez de spinner) | `components/Skeleton.js` *(nuevo)* + historial |
| 3 | Filtros recordados + búsqueda con debounce | en `historial/page.js` |
| 4 | Confirmación "✅ Guardado" al cambiar subestado | `components/ToastHost.js` *(nuevo)* + layout |
| 5 | Banner de "Sin conexión / Conexión restablecida" | `components/ConnectionBanner.js` *(nuevo)* + layout |

## Cómo instalar (3 pasos)

1. **Copia los archivos nuevos** a tu repo, respetando las carpetas:
   ```
   quick-wins/components/Skeleton.js          →  components/Skeleton.js
   quick-wins/components/ConnectionBanner.js  →  components/ConnectionBanner.js
   quick-wins/components/ToastHost.js         →  components/ToastHost.js
   ```

2. **Reemplaza** estos dos archivos existentes por los de aquí:
   ```
   quick-wins/app/dashboard/historial/page.js →  app/dashboard/historial/page.js
   quick-wins/app/dashboard/layout.js         →  app/dashboard/layout.js
   ```
   (El `layout.js` es idéntico al tuyo + 2 imports nuevos y 2 componentes montados:
   `<ConnectionBanner />` arriba y `<ToastHost />` al final.)

3. **Deploy normal** (`git add . && git commit && git push` → Vercel).
   No hay variables de entorno ni dependencias nuevas.

## Notas

- **#4 funciona sin tocar Producción.** `ToastHost` envuelve `window.fetch` y muestra
  "✅ Guardado" automáticamente cuando un `PATCH /api/pedidos/item` responde OK.
  Nunca modifica la respuesta — solo escucha. Si prefieres mensajes manuales en otros
  lados: `import { showToast } from '@/components/ToastHost'` y llama `showToast('Tu mensaje')`.
- **#1 paginación es en el cliente**: sigue trayendo todos los pedidos de Sheets, pero
  solo renderiza 30 a la vez (lo que traba el celular es renderizar cientos de tarjetas,
  no traerlas). Si más adelante quieres paginar también la carga desde el API, te ayudo
  con ese cambio (toca `app/api/pedidos/route.js`).
- **Filtros recordados** se guardan en `localStorage` bajo `mp_historial_filtros`.
  La búsqueda de texto NO se recuerda a propósito (suele ser de un solo uso).
- Tailwind ya trae `animate-pulse`. Las clases `animate-in / slide-in-from-*` que usa el
  toast vienen de `tailwindcss-animate`; tu app ya las usa en `NotifToast.js`, así que
  funcionan. Si por alguna razón no, el toast igual aparece (solo sin la micro-animación).
