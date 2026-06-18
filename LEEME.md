# Archivos corregidos — Mandarina Pro

⚠️ A los archivos de código les quité el `.txt` final solo para empaquetarlos.
**Después de descomprimir, renómbralos quitando el `.txt`** y cópialos a su carpeta.

| Archivo en el ZIP | Renómbralo a | Carpeta de tu app (reemplaza) | Arregla |
|---|---|---|---|
| `lib/sheets.js.txt`            | `sheets.js`     | `lib/`             | ⭐ BLINDAJE: ningún pedido vuelve a fallar por "50000 characters" |
| `app/api/pedidos/route.js.txt` | `route.js`      | `app/api/pedidos/` | Sube comprobante a Cloudinary (URL, no base64) |
| `app/api/upload/route.js.txt`  | `route.js`      | `app/api/upload/`  | "Invalid Signature" al subir AI/PSD/PDF |
| `lib/cloudinary.js.txt`        | `cloudinary.js` | `lib/`             | "Invalid Signature" (firma) |

> Quitar el `.txt` = clic derecho → Cambiar nombre → borra `.txt` del final.

## ⭐ El más importante para el error que tienes ahora
`lib/sheets.js` es el **blindaje**: aunque una foto no se suba bien, el pedido se
crea igual (descarta el base64 gigante en vez de romper todo). **Si solo tienes
tiempo para uno, reemplaza este.** Lo ideal es reemplazar los 4.

## Pasos
1. Descomprime el ZIP y quita el `.txt` a los 4 archivos.
2. Cópialos a sus carpetas (acepta "reemplazar").
3. Desde la raíz del proyecto:
   ```bash
   git add .
   git commit -m "Fix subida: blindaje celdas + firma Cloudinary + comprobante a URL"
   git push origin main
   ```
4. **Verifica en Vercel** que el deploy nuevo terminó (estado "Ready") antes de probar.

## Importante
Si el error "50000 characters" sigue, casi seguro el deploy anterior **no incluyó
`lib/sheets.js` ni `app/api/pedidos/route.js`**. Confirma en Vercel → Deployments
que el último build es posterior a tu push, y que esos 2 archivos están actualizados
en tu repo de GitHub.
