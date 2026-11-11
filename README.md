# La Joaquina · Hogar & Deco

Tienda completa en Node.js + Express 5, sin build step. Incluye un catálogo de 46
productos de hogar y deco, carrito, checkout multipasarela, seguimiento público,
backoffice analítico y una integración real con **CJ Dropshipping** para crear,
pagar y sincronizar pedidos.

Los datos viven en `data/db.json`. El servidor escucha en `http://localhost:4173`.

## Arranque

```bash
npm install
npm start          # producción local
npm run dev        # reinicia solo al cambiar el servidor
npm run seed       # regenera 120 días de dataset demo
npm run check:browser  # búsqueda, orden, estado vacío y compartir producto
```

- Tienda: `http://localhost:4173`
- Backoffice: `http://localhost:4173/admin` — con `.env`, usá la clave definida en `ADMIN_PASSWORD`
- Playbook: `http://localhost:4173/playbook`

`check:browser` usa el Edge o Chrome instalado. Si el navegador está en otra
ruta, definí `BROWSER_PATH` con el ejecutable.

Copiá `.env.example` como `.env` y completá solo lo que uses. Sin claves, todo
funciona en **modo demo**: pagos simulados y proveedor demo con tracking ficticio.
En producción usá `DEMO_MODE=false` y `ADMIN_PASSWORD`/`SESSION_SECRET` propios.
La tienda no arranca con `NODE_ENV=production` si `ADMIN_PASSWORD` sigue en el
valor por defecto o si `SESSION_SECRET` tiene menos de 32 caracteres.

## Pagos

Cada pasarela se activa sola al completar sus variables:

| Método | Variables | Webhook |
| --- | --- | --- |
| MercadoPago | `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY`, `MP_WEBHOOK_SECRET` | `/api/webhooks/mercadopago` |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | `/api/webhooks/stripe` |
| PayPal | `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `PAYPAL_WEBHOOK_ID` | `/api/webhooks/paypal` |
| USDT automático | `NOWPAYMENTS_API_KEY`, `NOWPAYMENTS_IPN_SECRET` | `/api/webhooks/crypto` |
| Transferencia | `BANK_*` | conciliación manual desde el admin |

Si una pasarela tiene clave pero le falta el secreto de webhook, el webhook
responde `503` en vez de aprobar el pago. El evento siempre es idempotente.

### Activar Mercado Pago (Checkout Pro)

Para esta tienda conviene **Checkout Pro**: el comprador termina el pago en
Mercado Pago y vuelve a La Joaquina. Así no se capturan datos de tarjeta en la
tienda y el flujo existente confirma el pago desde el webhook firmado. La
integración ya está en `src/payments/mercadopago.js` y
`/api/webhooks/mercadopago`.

1. Entrá al [panel de desarrolladores de Mercado Pago](https://www.mercadopago.com.ar/developers/panel),
   iniciá sesión con la cuenta que recibirá los cobros y creá una aplicación
   para Checkout Pro.
2. Desde las credenciales de la aplicación, copiá primero el **Access Token de
   prueba**. No lo compartas ni lo pongas en archivos del frontend.
3. En `.env`, configurá:

   ```env
   MP_ACCESS_TOKEN=TEST-...
   MP_WEBHOOK_SECRET=...
   BASE_URL=https://tu-dominio-publico
   DEMO_MODE=false
   ```

   `MP_PUBLIC_KEY` está disponible en `.env.example`, pero el Checkout Pro de
   esta tienda no la necesita: la preferencia se crea desde el servidor usando
   el Access Token. Conservá el prefijo `TEST-` mientras probás.
4. En la configuración de webhooks de la aplicación, registrá
   `https://tu-dominio-publico/api/webhooks/mercadopago` y habilitá las
   notificaciones de pagos. Copiá la clave secreta de firma que muestra
   Mercado Pago en `MP_WEBHOOK_SECRET`. El webhook requiere una URL pública
   alcanzable por HTTPS; `localhost` no sirve para recibir notificaciones.
5. Reiniciá el servidor y hacé una compra de prueba con credenciales y un
   comprador de prueba de Mercado Pago. Confirmá que el checkout redirige al
   `init_point` de prueba y que el pedido cambia de estado cuando llega el
   webhook. La página de retorno no confirma el pago por sí sola.
6. Para vender, reemplazá el token de prueba por el **Access Token de
   producción**, comprobá que la cuenta esté habilitada para cobrar y que el
   dominio y webhook HTTPS estén configurados. Mantené `DEMO_MODE=false`,
   `BASE_URL` con el dominio real y los secretos solo en el entorno del
   servidor.

Si probás en local, usá un túnel HTTPS temporal como `BASE_URL` para que
Mercado Pago pueda llamar al webhook. No publiques ese enlace ni los tokens.

## Dropshipping real con CJ

La integración usa la API v2 de CJ y se activa con `CJ_API_KEY`. Los pedidos
pagados se crean automáticamente, se pagan desde tu saldo (opcional) y el
tracking se sincroniza por webhook y por polling.

### 1. Credenciales

En **CJ → Developers → API Keys** generá la API key. Copiá también el `openId`
de la cuenta: CJ lo devuelve al autenticar y se usa para firmar los webhooks.

```env
SUPPLIER_PROVIDER=cj
CJ_API_KEY=tu_api_key
CJ_OPEN_ID=tu_open_id
CJ_SANDBOX=true              # true = sandbox, no cobra ni genera logística real
SUPPLIER_AUTO_PAY=false      # true = paga desde el saldo CJ (payType=2)
SUPPLIER_SYNC_MINUTES=15
SUPPLIER_MAX_ATTEMPTS=8
```

Reiniciá el servidor. En **Admin → Automatización** la tarjeta *Proveedor de
dropshipping* debe mostrar `cj · sandbox` o `cj · live`.

### 2. SKU de productos

Cada producto tiene un SKU propio (`LJ-001` a `LJ-046`). Reemplazalos por los SKU
o VID reales de CJ con `CJ_SKU_MAP`, sin tocar el código:

```env
# Un SKU por producto
CJ_SKU_MAP={"massage-gun":"CJYH288349401AZ","set-bano-5":"CJFLW123456"}

# O un SKU/VID por color (recomendado si CJ usa variantes)
CJ_SKU_MAP={"massage-gun::Negro":"CJ...","massage-gun::Verde":"CJ..."}
```

La clave puede ser el `id` del producto (`massage-gun`), su `supplierSku`, o
`id::color` para una variante concreta. El checkout envía el color elegido; si
existe el mapeo por variante se usa ese SKU y, si no, cae al SKU del producto.
Si un SKU no existe o no tiene stock, CJ rechaza el alta y el pedido queda en
cola con el error visible.

### 3. Webhook

Registrá en CJ la URL pública:

```
https://TU-DOMINIO/api/webhooks/cj
```

CJ firma el cuerpo crudo con HMAC-SHA256 en Base64 y lo envía en el header
`sign`. La verificación usa `CJ_OPEN_ID`; podés usar un secreto propio con
`CJ_WEBHOOK_SECRET`. Eventos `ORDER` y `LOGISTIC` actualizan tracking y estado.
Los eventos repetidos se ignoran por `messageId`.

### 4. Operación

- Alta y pago ocurren al aprobarse el pago. Si CJ falla, el pedido queda en
  `retry` con backoff exponencial (máx. 8 intentos) y error visible en el admin.
- **Admin → Pedido → Proveedor → Reintentar** fuerza un reintento inmediato.
- **Procesar cola** y **Sincronizar tracking** están en Automatización.
- El scheduler corre la cola cada 60 s y el tracking cada `SUPPLIER_SYNC_MINUTES`.
- Un webhook fuera de orden nunca retrocede el estado (enviado → entregado).
- Para vender de verdad: `CJ_SANDBOX=false` y, si querés pago automático,
  `SUPPLIER_AUTO_PAY=true` con saldo disponible en CJ.

## Verificación

```bash
npm run check           # demo (13 checks) + proveedor CJ simulado (6 checks)
npm run check:demo      # flujo completo con pagos y proveedor demo
npm run check:supplier  # CJ falso local: alta, pago, tracking, webhook, retry
```

Los tests levantan la app en puertos aleatorios y no tocan el servidor de
desarrollo. El test de CJ usa un proveedor simulado: no reemplaza una prueba con
credenciales reales.

## Troubleshooting

| Síntoma | Causa / solución |
| --- | --- |
| La tarjeta dice `demo` aunque configuraste CJ | Falta `CJ_API_KEY` o no reiniciaste el proceso. |
| `401 Firma inválida` en `/api/webhooks/cj` | `CJ_OPEN_ID`/`CJ_WEBHOOK_SECRET` no coincide con CJ. |
| `Insufficient inventory` o SKU inválido | Corregí `CJ_SKU_MAP` y verificá stock en CJ. |
| Pedido en `retry` | Mirá el error en el modal; reintentá desde el admin. |
| Pedido pagado sin tracking | Esperá el polling o usá **Sincronizar tracking**. |
| Webhook de pago responde `503` | La pasarela tiene clave pero falta su secreto de webhook. |
| En producción aparece el pago demo | Poné `DEMO_MODE=false`. |
| El total de MercadoPago no coincide | Actualizá a la versión con reparto exacto por línea. |

## Limitaciones

- No se probaron cobros ni logística reales: no hay credenciales de CJ,
  MercadoPago, Stripe, PayPal ni NOWPayments en este entorno.
- La integración CJ se validó contra un servidor simulado que replica auth,
  alta, pago, detalle y webhooks.
- Los emails se registran en el log si no hay `RESEND_API_KEY`.
