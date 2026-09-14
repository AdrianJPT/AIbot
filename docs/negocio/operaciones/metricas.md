---
id: negocio.operaciones.metricas
estado: requerido-desde-primer-cliente
actualizado: 2026-09-12
---

# Métricas operativas y económicas

## Por número y mes

- Chats abiertos, cerrados, reabiertos y tiempo hasta resolución.
- Resultado: venta confirmada, derivación o cierre sin venta.
- Mensajes entrantes y salientes por categoría Meta; promedio por chat.
- P50 y P90 de respuestas salientes por chat y por número.
- Tokens de entrada, caché y salida.
- Minutos de audio y llamadas de visión.
- Cargos Meta por categoría y por número; nunca agrupar la franquicia.
- Mensajes entrantes/salientes y cargo de transporte Twilio por teléfono/WABA.
- Cobro anticipado confirmado, saldo y conciliación mensual con Twilio.
- Horas de onboarding y soporte.
- Derivaciones, errores e incidentes.
- Continuidad, cancelación y motivo.

## Ya disponible en el producto

El chat registra uso de tokens cuando OpenAI lo devuelve: [`src/lib/ai/generate.ts`](../../../src/lib/ai/generate.ts) y [`src/lib/message-handler.ts`](../../../src/lib/message-handler.ts). El esquema tiene `dailyAiLimit`, pero el límite se basa en mensajes del bot y no demuestra por sí mismo el costo total de audio y visión: [`prisma/schema.prisma`](../../../prisma/schema.prisma).

## Falta crítica

Consolidar audio, visión, Meta, infraestructura y horas humanas por número. Hasta entonces, [`../economia/unit-economics.md`](../economia/unit-economics.md) es un escenario y no un estado contable.

## Cadencia

- Semanal durante pilotos: activación, fallos y soporte.
- Mensual: contribución por número, conversión chat→venta y exceso de plan.
- Al día 30 o tras cinco clientes pagados: sustituir el supuesto de 6 respuestas por P50/P90 observados.
- Trimestral: actualizar precios de proveedores y supuestos.
