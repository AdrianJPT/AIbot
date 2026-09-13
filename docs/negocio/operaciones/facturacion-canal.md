---
id: negocio.operaciones.facturacion-canal
estado: arquitectura-de-lanzamiento
actualizado: 2026-09-12
---

# Arquitectura de facturación del canal

## Decisión de lanzamiento

Un Tech Provider ordinario de Cloud API no debe asumir que puede agrupar facturas Meta de clientes. Para entregar una sola factura desde el primer cliente, AIbot usa **Twilio como puente**:

1. El cliente paga por adelantado una factura AIbot.
2. AIbot presta el servicio y mide cada teléfono/WABA.
3. Twilio factura a AIbot transporte y consumo Meta.
4. AIbot paga Twilio; el cliente no recibe una factura Meta separada.

Twilio agrega US$0.005 por cada mensaje entrante y saliente gestionado, además de Meta. Fuentes: [FAQ Tech Provider](https://www.twilio.com/docs/whatsapp/isv/tech-provider-program/faq) y [precios WhatsApp](https://www.twilio.com/en-us/whatsapp/pricing).

## Controles obligatorios

- Prepago o autopay confirmado antes de renovar.
- Ledger de mensajes, categoría y costo por teléfono/WABA.
- Alertas al 80% y 100%; nunca cortar un chat activo.
- Ascenso de plan o paquete solo mediante regla preaceptada.
- Marketing separado del tráfico estándar de servicio.
- Conciliar factura Twilio contra el ledger cada mes.

## Evolución

La Cloud API directa con tarifa PEN es el objetivo económico **solo** cuando AIbot disponga de una línea de crédito/pago compartido elegible como Solution Partner. Hasta entonces no es una ruta válida para centralizar cobros. La migración mejora margen y no obliga a reducir precios.

[360dialog Partner-Paid](https://docs.360dialog.com/partner/get-started/billing-and-invocing/partner-paid) exige contrato y cuesta US$500/mes + US$25/número: no es viable para los primeros clientes, pero puede ser relevante luego, sobre todo con alto volumen.

Supuestos: [`../economia/supuestos.md`](../economia/supuestos.md). Tarifario: [`../precios/tarifario.md`](../precios/tarifario.md).
