---
id: negocio.economia.supuestos
estado: hipotesis-piloto
actualizado: 2026-09-12
---

# Supuestos económicos de lanzamiento

**Vigencia única:** desde el 1 de octubre de 2026. El lanzamiento usa Twilio como puente de facturación centralizada; no presupone acceso directo a una línea de crédito Meta.

| Variable | Supuesto central |
|---|---:|
| Tipo de cambio | S/3.80 por USD |
| Tráfico por chat | 6 mensajes entrantes + 6 respuestas IA |
| Sensibilidad de respuestas IA | 4 / 6 / 10 |
| IA por respuesta saliente | S/0.003 |
| Infraestructura por número | S/18.75/mes, con 10 números activos |
| Soporte Starter / Basic / Pro / Premium | 0.25 / 0.5 / 0.75 / 1 h a S/35/h |
| Reserva herramientas/contingencia | S/10 / S/10 / S/10 / S/15 |

No existe un promedio universal verificado. Sustituir seis respuestas por P50/P90 observados tras 30 días o cinco clientes pagados.

## Costos de canal al lanzamiento

Twilio cobra **US$0.005 = S/0.019** por cada mensaje entrante y saliente gestionado. Además traslada Meta: para planificar servicio en Perú se usa **US$0.0300 = S/0.114** por mensaje entregado después de 1,000 mensajes de servicio gratis al mes por número.

- `Meta = max(0, respuestas de servicio − 1,000) × S/0.114`.
- `Twilio = (mensajes entrantes + salientes) × S/0.019`.

| Plan | 4 respuestas/chat | 6 respuestas/chat | 10 respuestas/chat |
|---|---:|---:|---:|
| Starter, 150 chats | S/28.50 | S/34.20 | S/102.60 |
| Basic, 300 chats | S/79.80 | S/159.60 | S/319.20 |
| Pro, 500 chats | S/209.00 | S/342.00 | S/608.00 |
| Premium, 1,500 chats | S/855.00 | S/1,254.00 | S/2,052.00 |

La tabla suma Meta + Twilio manteniendo 6 mensajes entrantes y variando respuestas salientes. Fuentes: [Twilio precios](https://www.twilio.com/en-us/whatsapp/pricing) y [FAQ Tech Provider](https://www.twilio.com/docs/whatsapp/isv/tech-provider-program/faq).

## Meta directo futuro

La tarifa oficial directa PEN es S/0.0998 para servicio/utilidad/autenticación y S/0.2339 para marketing. Es un escenario futuro sujeto a una línea de crédito/pago compartido elegible, no el costo de lanzamiento. [Tarifario Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing#rate-cards-effective-october-1-2026).

Arquitectura de cobro: [`../operaciones/facturacion-canal.md`](../operaciones/facturacion-canal.md).
