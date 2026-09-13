---
id: negocio.producto.alcance
estado: vigente
actualizado: 2026-09-12
---

# Alcance y unidades operativas

## Qué incluye cada número

- Respuestas con el conocimiento del negocio y derivación humana.
- Texto, notas de voz e imágenes dentro de uso razonable.
- Historial, ajustes de activación y soporte según plan.
- Apoyo a reservas, pedidos y revisión de comprobantes; la decisión final queda en el negocio.

## Tres unidades distintas

| Unidad | Definición operativa | Para qué sirve |
|---|---|---|
| Mensaje | Una burbuja enviada por cliente o negocio | Meta factura mensajes empresariales entregados |
| Chat | Interacción completa desde el primer mensaje hasta 24 h de inactividad; el regreso posterior abre otro chat | Capacidad comercial de AIbot |
| Venta cerrada | Chat que alcanza pedido, reserva o pago confirmado según la regla del negocio | Medir resultado comercial |

Un chat contiene todas las burbujas entrantes y salientes dentro de esa interacción y puede terminar sin venta. El producto debe registrar inicio, última actividad, cierre y resultado para aplicar la regla sin ambigüedad.

## Happy path peruano de referencia

1. Cliente consulta precio o disponibilidad por WhatsApp.
2. AIbot aclara necesidad, responde y ofrece una opción disponible.
3. Cliente confirma producto, delivery/recojo y datos necesarios.
4. AIbot envía instrucciones o enlace de pago; el cliente manda comprobante.
5. El negocio verifica stock y pago, confirma pedido y AIbot marca **venta cerrada**.
6. Si solo se resolvió una duda, se marca **chat cerrado sin venta**.

Este es un escenario, no una tasa garantizada. Yape/Plin, transferencia, contraentrega, reservas y políticas de comprobante cambian por negocio.

## Límites

- Capacidad y franquicia de Meta se miden por número y no se agrupan.
- Campañas, integraciones y flujos a medida se cotizan aparte.
- AIbot no garantiza ventas ni confirma autenticidad bancaria.

Economía: [`../economia/unit-economics.md`](../economia/unit-economics.md). Métricas: [`../operaciones/metricas.md`](../operaciones/metricas.md).
