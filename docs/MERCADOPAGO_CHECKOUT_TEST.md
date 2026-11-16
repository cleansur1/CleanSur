# StayClean — Mercado Pago Checkout Pro (Orders API)

Estado: desarrollo en rama de prueba. No desplegar en producción hasta completar revisión y pruebas.

## Rama
`feature/mercadopago-checkout-pro-test`

## Archivos incorporados
- `supabase/migrations/20261116190000_stayclean_mercadopago_checkout_pro.sql`
- `supabase/functions/create-mp-checkout/index.ts`
- `supabase/functions/mp-webhook/index.ts`
- `supabase/functions/get-mp-checkout-status/index.ts`
- `erp/js/supabase_public.js`
- `erp/js/tienda_standalone.js`

## Flujo
1. El cliente autenticado selecciona Mercado Pago.
2. La función SQL valida perfil, catálogo, precios y disponibilidad y crea un intento con reserva temporal de stock (sin descontar inventario físico).
3. La Edge Function crea una Order de Mercado Pago con idempotencia y devuelve `checkout_url`.
4. Mercado Pago notifica al webhook.
5. El webhook valida `x-signature`, consulta la Order directamente en Mercado Pago y solo procesa estado `processed` + detalle `accredited`.
6. La función SQL crea el pedido y descuenta inventario una sola vez.
7. La página de retorno consulta el estado autenticado y vacía el carrito solo si el pedido quedó aprobado.

## Secretos Supabase
Ya cargado por el usuario:
- `MERCADOPAGO_ACCESS_TOKEN` (token de prueba)

Pendiente después de configurar Webhooks en Mercado Pago:
- `MERCADOPAGO_WEBHOOK_SECRET` (firma secreta de Webhooks del entorno Prueba)

No guardar Access Tokens ni firmas secretas en GitHub o frontend.

## Configuración Webhooks Mercado Pago
Una vez desplegada la función `mp-webhook`, configurar en la aplicación de Mercado Pago, ambiente Prueba:
- URL: `https://zesdbnbijoqjjmwhuttp.supabase.co/functions/v1/mp-webhook`
- Evento: `Order (Mercado Pago)`
- Guardar y copiar la firma secreta al secreto `MERCADOPAGO_WEBHOOK_SECRET` de Supabase.

## Precauciones y pruebas pendientes
- Aplicar la migración solo después de revisar el SQL con el esquema actual.
- Desplegar las tres Edge Functions en el proyecto de prueba.
- Confirmar que la cuenta de prueba tenga email y perfil de cliente completos.
- Probar stock suficiente, stock insuficiente, pagos aprobados, rechazados, expirados, doble webhook, doble clic y compra concurrente de última unidad.
- Revisar el flujo de caja/ERP para que el pedido figure como Mercado Pago pagado.
- Verificar que las reservas temporales se liberen por vencimiento y que el ERP/POS no venda unidades reservadas. La función de checkout las contempla; la lógica de disponibilidad del POS debe ser auditada antes de producción.
- No publicar la rama ni activar cobros reales hasta completar todas las pruebas.

## Decisión de inventario
El inventario físico se descuenta únicamente después de confirmación server-side de pago acreditado. Durante el checkout existe una reserva temporal lógica para evitar sobreventa; no modifica `products.current_stock`.
