---
id: negocio.precios.competencia-proveedores
estado: evidencia-externa-2026-09-12
actualizado: 2026-09-12
---

# Competidores y costos de canal

Las unidades publicadas no siempre son comparables: conversación, contacto y burbuja miden cosas distintas.

## YaVendió

| Plan a 3 meses | Capacidad | Precio publicado |
|---|---:|---:|
| Free | 100 conversaciones | US$0 |
| Starter | 500 conversaciones | US$39/mes |
| Pro | 1,500 conversaciones | US$99/mes |

La [página oficial](https://yavendio.com/pe/precios) cobra Meta aparte y ofrece Business desde US$349. Su ejemplo de conversión de 5%–10% confirma que “conversación” es una interacción completa. No se encontró una revisión pública post-octubre al 2026-09-12; confirmar por escrito su tratamiento de Meta.

## Rutas de facturación

| Opción | Costo público | Rol |
|---|---|---|
| [Twilio](https://www.twilio.com/en-us/whatsapp/pricing) | US$0.005 por entrada y salida + Meta en USD | Puente de lanzamiento que factura a AIbot |
| [360dialog Regular](https://docs.360dialog.com/docs/pricing) | US$59 por número | BSP con costo fijo |
| [360dialog Partner-Paid](https://docs.360dialog.com/partner/get-started/billing-and-invocing/partner-paid) | US$500/mes + US$25/número y contrato | Ruta posterior; frente a Regular cruza cerca de 15 números |
| Meta Cloud API directa | Tarifa oficial PEN | Futuro: requiere crédito/pago compartido elegible |

No mezclar escenarios: lanzamiento usa Meta vía Twilio a US$0.0300, convertido a S/0.114; el escenario directo futuro usa S/0.0998. [FAQ Tech Provider](https://www.twilio.com/docs/whatsapp/isv/tech-provider-program/faq) y [tarifario Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing#rate-cards-effective-october-1-2026).

## Alternativa no equivalente

[Manychat Pro](https://help.manychat.com/hc/en-us/articles/25800228332572-Pro-plan) cuesta US$39 con 2,500 contactos activos, pero contactos no son chats. [AI Replies](https://help.manychat.com/hc/en-us/articles/23018283889180-Manychat-AI-Replies) está documentado para Instagram, no como agente completo WhatsApp.

Arquitectura decidida: [`../operaciones/facturacion-canal.md`](../operaciones/facturacion-canal.md). Tarifario: [`tarifario.md`](tarifario.md).
