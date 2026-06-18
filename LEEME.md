# Archivos corregidos — Mandarina Pro

⚠️ IMPORTANTE: a los 3 archivos de código les quité el `.txt` final solo para poder
empaquetarlos. **Después de descomprimir, renómbralos quitando el `.txt`:**

| Archivo en el ZIP | Renómbralo a | Va a esta carpeta de tu app (reemplaza) |
|---|---|---|
| `app/api/upload/route.js.txt`  | `route.js`     | `app/api/upload/`  |
| `app/api/pedidos/route.js.txt` | `route.js`     | `app/api/pedidos/` |
| `lib/cloudinary.js.txt`        | `cloudinary.js`| `lib/`             |

> Quitar el `.txt` = clic derecho → Cambiar nombre → borrar `.txt` del final.
> Son tus mismos archivos, solo con la corrección de los 2 errores.

## Qué arregla
- `app/api/upload/route.js` + `lib/cloudinary.js` → el error **"Invalid Signature"** al subir AI/PSD/PDF.
- `app/api/pedidos/route.js` → el error **"máximo 50000 characters"** al subir la foto del comprobante.

## Pasos
1. Descomprime el ZIP.
2. Quita el `.txt` a los 3 archivos (ver tabla).
3. Cópialos a sus carpetas en tu proyecto (acepta "reemplazar").
4. Desde la raíz del proyecto:
   ```bash
   git add .
   git commit -m "Fix subida: firma Cloudinary + comprobante a URL"
   git push origin main
   ```
5. Vercel redespliega solo.

## Probar después del deploy
- Nuevo pedido → **Subir archivo de diseño** (PDF/AI/PSD) → sube sin error.
- Pago **TRANSFERENCIA** → foto del comprobante → **Crear pedido** → se crea sin el error de 50000 caracteres.
