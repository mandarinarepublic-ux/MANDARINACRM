# Mandarina Pro — CRM

Sistema de gestión para Mandarina Republic e Indstore.

## Stack
- **Frontend/Backend**: Next.js 14 (App Router)
- **Base de datos**: Google Sheets
- **Archivos/Fotos**: Google Drive
- **Catálogo**: Shopify API (Mandarina + Indstore)
- **Mapas**: Google Maps + Places API
- **Hosting**: Vercel

## Setup rápido

### 1. Variables de entorno en Vercel

En tu proyecto Vercel → Settings → Environment Variables, agrega:

```
GOOGLE_SERVICE_ACCOUNT_EMAIL=mandarina-pro-sheets@gen-lang-client-0034534950.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
SHEET_ID=15OeKiQH3y4PmY_nMQyJoDHZnpeMFFzCr
NEXT_PUBLIC_GOOGLE_MAPS_KEY=TU_KEY_MAPS
SHOPIFY_MANDARINA_STORE=mandarinaec.myshopify.com
SHOPIFY_MANDARINA_TOKEN=TU_TOKEN
SHOPIFY_INDSTORE_STORE=indlovers.myshopify.com
SHOPIFY_INDSTORE_TOKEN=TU_TOKEN
DRIVE_ROOT_FOLDER_ID=ID_CARPETA_RAIZ_DRIVE
```

### 2. Shopify Tokens

Para cada tienda en Shopify Admin:
```
Settings → Apps → Develop apps → Create app
→ Admin API scopes: read_products, read_inventory
→ Install app → Copiar Admin API access token
```

### 3. Google Maps API Key

En Google Cloud Console (proyecto WAINBOX):
```
APIs & Services → Credentials → Create Credentials → API Key
→ Restrict key → HTTP referrers → tu-dominio.vercel.app/*
```

### 4. Drive Root Folder

Crea una carpeta en Google Drive llamada "Mandarina Pro - Pedidos"
→ Click derecho → Compartir con la service account (Editor)
→ Copia el ID de la URL: drive.google.com/drive/folders/[ESTE_ID]

### 5. Deploy

```bash
# Conecta tu repo a Vercel y hace push
git init
git add .
git commit -m "Mandarina Pro v1"
git remote add origin TU_REPO
git push -u origin main
```

## Módulos

| Módulo | Roles | Descripción |
|--------|-------|-------------|
| Nueva Venta | ADMIN, VENDEDOR | Formulario de ingreso de pedidos |
| Historial | ADMIN, VENDEDOR | Lista de pedidos con filtros |
| Producción | ADMIN, DISEÑO | Vista por área con estados |
| Despacho | ADMIN, DESPACHO | Registro de guías Servientrega |
| Usuarios | ADMIN | Gestión de accesos |

## Estructura de Google Sheets

El Sheet ID `15OeKiQH3y4PmY_nMQyJoDHZnpeMFFzCr` debe tener estas hojas:
- TIENDAS
- USUARIOS  
- CLIENTES
- PEDIDOS
- DETALLE_PEDIDO
- PAGOS
- GUIAS_DESPACHO
- LEYENDA
- DIAS_ENTREGA
