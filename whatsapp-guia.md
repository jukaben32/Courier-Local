# WhatsApp en Courier Local — guía paso a paso

Método: **YCloud en modo coexistencia**. El número del negocio sigue funcionando en la app
**WhatsApp Business** del celular (el personal puede responder a mano) y al mismo tiempo lo usa el
sistema por la API oficial de Meta.

## Lo que se necesita antes de empezar
- Un **número nuevo a nombre del negocio** (no el teléfono del courier ni uno personal), instalado en
  la app **WhatsApp Business** (la de Google Play / App Store, no la normal).
- Una **cuenta de Facebook personal** de quien administrará (una cuenta recién creada puede tardar
  días en ser aceptada por Meta; mejor usar una que ya exista).
- Una **tarjeta** para dejarla en Meta (ver "Costos").

## Paso 1 — Portafolio empresarial en Meta (≈10 min)
1. Entrar a `business.facebook.com` con Facebook.
2. Crear un **portafolio empresarial** con el nombre del negocio (no hace falta que esté verificado;
   cuando la S.R.L. tenga RNC se verifica para subir los límites de mensajes).
3. Facturación y pagos → **método de pago** → agregar la tarjeta.

## Paso 2 — Cuenta en YCloud (≈10 min)
1. Registrarse en `ycloud.com` (el plan gratis permite 2 números de WhatsApp).
2. **Cuenta de WhatsApp → modo coexistencia (WhatsApp Business app) → Comenzar.**
3. Elegir el portafolio del paso 1, marcar *conectar con una aplicación de WhatsApp Business* y
   escribir el número.
4. En el celular: WhatsApp Business → tres puntos → **Dispositivos vinculados → Vincular un
   dispositivo** → escanear el QR. Dejar el celular desbloqueado hasta que termine.

## Paso 3 — Las 4 claves (≈5 min)
Se pegan en `app/.env.local` (o en las variables de Vercel):

| Variable | Dónde se saca |
|---|---|
| `YCLOUD_API_KEY` | YCloud → Developers → API keys |
| `YCLOUD_WHATSAPP_NUMBER` | El número del negocio, con formato `+18295550000` |
| `YCLOUD_WEBHOOK_SECRET` | YCloud → Developers → Webhooks (lo genera YCloud al crear el webhook, paso 5) |
| `YCLOUD_WABA_ID` | YCloud → WhatsApp → Business accounts (solo para crear plantillas con el script) |

Cuando `YCLOUD_API_KEY` y `YCLOUD_WHATSAPP_NUMBER` están llenas, la app deja el modo simulado y envía de verdad.

## Paso 4 — Plantillas (≈10 min de trabajo, Meta tarda de minutos a 1 día en aprobar)
**Qué es una plantilla:** un mensaje con el texto ya fijado y huecos (`{{1}}`, `{{2}}`) que Meta aprueba
**una vez**. Es la única forma de escribirle *primero* a un cliente. Cuando el cliente responde (por
ejemplo toca un botón), se abre una ventana de 24 horas en la que ya se puede escribir libre: ahí van
los botones de horario, el pedido de ubicación y las confirmaciones.

Las 6 plantillas están definidas en `app/src/lib/whatsapp/plantillas.ts` (categoría **Utilidad**):

| Plantilla | Cuándo se usa | Botones |
|---|---|---|
| `aviso_paquete_llegada` | Primer aviso al llegar el paquete | 12 a 3 pm · 3 a 6 pm · Otra persona lo recibe |
| `recordatorio_coordinar` | Si no respondió en 1–2 horas (o al día siguiente) | 9 a 12 · 12 a 3 · 3 a 6 · Paso a buscarlo |
| `ultimo_dia_paquete` | Tercer día (último intento) | 12 a 3 pm · 3 a 6 pm · Paso a buscarlo |
| `repartidor_en_camino` | Al salir hacia su casa | — |
| `paquete_entregado` | Confirmación de entrega | — |
| `intento_fallido_reprogramar` | No se pudo entregar | Reprogramar entrega · Paso a buscarlo |

Para crearlas todas de una vez (después del paso 3):
```
cd "Courier Local/app"
node scripts/crear-plantillas.mjs            # vista previa, no envía nada
node scripts/crear-plantillas.mjs --enviar   # las crea y las manda a revisión de Meta
```
Se ve el estado (aprobada / rechazada) en YCloud → WhatsApp → Templates. Si Meta rechaza una, casi
siempre es por el texto: se ajusta en `plantillas.ts` y se vuelve a crear con otro nombre.

## Paso 5 — Webhook (para recibir las respuestas)
1. YCloud → Developers → **Webhooks → Agregar**.
2. URL: `https://<dominio-de-la-app>/api/webhooks/ycloud`
3. Marcar **los dos** eventos: **WhatsApp inbound message received** (lo que escribe el cliente) y
   **WhatsApp message updated** (entregado / leído / falló).
4. Activar, y copiar el **secreto** que aparece a `YCLOUD_WEBHOOK_SECRET`.

Para probar desde la computadora (sin publicar la app) hace falta un túnel, por ejemplo Tailscale
Funnel o Cloudflare Tunnel: da una dirección `https` temporal que apunta al `localhost`. Ya con la
app publicada en Vercel no hace falta.

## Costos (investigado el 2026-10-02; confirmar en la reunión)
- **Tarifa de utilidad para República Dominicana: ≈ US$0.0113 por mensaje** (marketing US$0.0740).
  Dato tomado de un resumen de terceros de la tarifa de Meta de oct. 2026; confirmar en el panel de
  Meta (Facturación) o con YCloud.
- **YCloud no le suma nada** a lo de Meta ("zero mark-up") y su plan gratis incluye 2 números.
- **Duda sin resolver:** las páginas oficiales de Meta que se pudieron leer dicen que los mensajes
  libres y las plantillas de utilidad dentro de las 24 h siguen **gratis**; varios blogs dicen que
  desde el 1 de octubre de 2026 **se cobran también** (mensajes de servicio tras 1,000 gratis al mes
  por número). Hay que verlo en la tarifa real de la cuenta.

| Escenario (por cliente: aviso + 3 respuestas libres) | 100 clientes/día | 300 clientes/día |
|---|---|---|
| A. Solo cobra la plantilla que enviamos nosotros | ≈ US$29/mes | ≈ US$88/mes |
| B. Cobra todo (con 1,000 mensajes de servicio gratis al mes) | ≈ US$106/mes | ≈ US$341/mes |
| B + plantillas "en camino" y "entregado" a todos | ≈ US$176/mes | ≈ US$520/mes |

Cálculo: 26 días de reparto al mes y US$0.0113 por mensaje cobrado. Para pesos dominicanos, multiplicar
por la tasa del día (a ~RD$62 por dólar, 100 clientes/día en el escenario B son unos RD$6,500 al mes).

## Cómo es la conversación con el cliente
El 98 % de los clientes pide entrega a domicilio, así que el aviso ofrece **el horario directamente**
(el camión llega al mediodía, por eso el primer día solo salen 12–3 y 3–6):
1. Llega la **plantilla** con los botones de horario.
2. Toca un horario → se le pide **siempre** su **ubicación** 📍 (aunque ya tengamos la dirección de la
   etiqueta: a veces quien recibe está en otro lugar).
3. Comparte la ubicación → confirmación con el horario y recordatorio de la cédula.
- *Otra persona lo recibe* → se le explica que debe llevar la cédula del destinatario, y se le ofrecen los horarios.
- *Paso a buscarlo* solo va en los recordatorios (es poco usado) y le indica el horario de la oficina (hasta las 4:00 pm).
- Si toca un horario que ya pasó, se le muestran los que quedan.
- Un mensaje menos por cliente que antes (se quita la pregunta intermedia): ahorra costo y tiempo.
