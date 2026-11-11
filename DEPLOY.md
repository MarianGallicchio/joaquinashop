# Despliegue (público)

Este proyecto es una app **Node.js/Express** (backend + frontend estáticos en `public/`). GitHub almacena el código, pero para tener una URL/IP pública hay que desplegarlo en un hosting que ejecute Node.js.

## Opción recomendada: Render (desde GitHub)

1. Ingresá a [https://render.com](https://render.com) y creá/iniciá sesión.
2. **New +** → **Web Service** → conectá tu cuenta de GitHub y elegí el repo `MarianGallicchio/joaquinashop`.
3. Configuración:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** la que prefieras (Free funciona para pruebas, pero puede dormir/iniciar en frío y el disco es efímero).
4. En **Environment Variables** cargá las variables necesarias (no las subas al repo):
   - `ADMIN_PASSWORD` = contraseña del panel admin
   - `BASE_URL` = URL pública HTTPS de tu servicio en Render (ej. `https://tu-servicio.onrender.com`)
   - `MP_ACCESS_TOKEN` = Access Token de Mercado Pago
   - `MP_PUBLIC_KEY` = Public Key de Mercado Pago
   - `MP_WEBHOOK_SECRET` = secreto de firma del webhook (cuando lo configures)
   - `MP_CLIENT_ID` / `MP_CLIENT_SECRET` (si aplican)
   - Cualquier otra variable que uses (correo, proveedor, etc.)
5. Deploy. Cuando esté online, actualizá `BASE_URL` si cambió y reiniciá si hace falta.
6. En Mercado Pago Developers configurá la notificación/webhook a: `https://TU-DOMINIO/api/webhooks/mercadopago`.

## Notas importantes

- `PORT`: el hosting lo define automáticamente; la app ya lo respeta.
- **Persistencia:** los datos se guardan en `data/db.json` (archivo local). En Render Free y muchos hostings el disco es efímero (se pierde al redeploy/reinicio). Para producción real conviene migrar a una base de datos persistente.
- **Backups:** el módulo de backups escribe en `data/backups/`; en discos efímeros no son persistentes. Podés definir `BACKUP_ENCRYPTION_KEY` para cifrarlos en reposo.
- **Seguridad:** no subas `.env` ni `data/db.json` al repositorio. Rotá credenciales si fueron expuestas.

## Verificación post-deploy

- `GET https://TU-DOMINIO/api/health` debe responder OK.
- Probá catálogo, checkout y login admin.
- Probá un pago de prueba en Mercado Pago y confirmá que el estado del pedido se actualice.
