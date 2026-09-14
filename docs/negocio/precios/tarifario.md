---
id: negocio.precios.tarifario
estado: hipotesis-piloto-fuente-de-verdad
actualizado: 2026-09-12
---

# Tarifario de lanzamiento todo incluido

Desde el 1 de octubre de 2026, el cliente recibe **una sola factura AIbot**. Para hacerlo viable al lanzamiento, AIbot usa Twilio: AIbot paga a Twilio y Twilio liquida el consumo Meta.

| Plan | Chats/mes aprox. | Respuestas IA de servicio incluidas | Precio final con IGV |
|---|---:|---:|---:|
| Starter | 150 | 900 | **S/149** |
| Basic | 300 | 1,800 | **S/379** |
| Pro | 500 | 3,000 | **S/749** |
| Premium | 1,500 | 9,000 | **S/2,499** |

Un chat es la interacción completa desde el primer mensaje hasta 24 horas de inactividad; el regreso posterior inicia otro. La capacidad comercial se comunica en chats y la guarda de respuestas protege costos: **no hay respuestas ilimitadas**.

## Protección de capacidad y cobro

1. Cobrar por adelantado o mediante autopay antes de renovar.
2. Medir costo y uso por teléfono/WABA; avisar al 80% y 100%.
3. Nunca interrumpir un chat activo.
4. Ascender automáticamente de plan o aplicar un paquete solo con acuerdo previo.
5. No publicar un precio de exceso sin evidencia de consumo.

Marketing y campañas están fuera de la guarda estándar y se cotizan aparte. Un BSP alternativo o puente especial también requiere suplemento o plan superior.

## Camino futuro

Cloud API directa solo será ruta de factura centralizada cuando AIbot tenga una línea de crédito/pago compartido elegible. Migrar desde Twilio mejora el margen y **no reduce automáticamente el precio**. Ver [`../operaciones/facturacion-canal.md`](../operaciones/facturacion-canal.md).

## Hipótesis comercial

- Demo gratuita en número AIbot.
- Piloto vivo: S/250 + IGV de activación, más el plan en la primera factura.
- Cada número contrata su plan; no hay descuento recurrente por números adicionales.

Condiciones: [`politica-comercial.md`](politica-comercial.md). Costos: [`../economia/unit-economics.md`](../economia/unit-economics.md).
