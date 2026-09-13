---
id: negocio.indice
estado: vigente
actualizado: 2026-09-12
---

# Mapa de conocimiento comercial de AIbot

Este directorio contiene nodos breves y enlazados para recuperación por IA. Cada nodo responde una pregunta de negocio y declara qué decisión es canónica, qué es supuesto y qué evidencia falta.

## Reglas de lectura

- Los precios canónicos están únicamente en [`precios/tarifario.md`](precios/tarifario.md).
- Los costos y márgenes están únicamente en [`economia/unit-economics.md`](economia/unit-economics.md).
- Un mensaje es una burbuja. Un chat abarca desde el primer mensaje hasta 24 horas de inactividad; el regreso posterior inicia otro chat. Una venta cerrada exige pedido, pago o reserva confirmados.
- Los importes comerciales están en soles y no incluyen IGV, salvo indicación expresa.
- Todo el modelo rige desde el 1 de octubre de 2026: no existe una tarifa transitoria más barata para septiembre.
- El cliente recibe una sola factura AIbot, con IGV incluido; AIbot absorbe Meta, IA, hosting, soporte y herramientas.
- “Verificado” significa comprobado en el repositorio o en una fuente oficial enlazada. “Supuesto” exige validación con facturas o pilotos.

## Índice por intención

| Pregunta | Nodo fuente de verdad |
|---|---|
| ¿Qué vendemos y a quién? | [`producto/propuesta.md`](producto/propuesta.md) |
| ¿Qué incluye el servicio? | [`producto/alcance.md`](producto/alcance.md) |
| ¿Cuánto cuesta cada número? | [`precios/tarifario.md`](precios/tarifario.md) |
| ¿Cómo se compara con YaVendió? | [`precios/competencia.md`](precios/competencia.md) |
| ¿Qué se puede negociar? | [`precios/politica-comercial.md`](precios/politica-comercial.md) |
| ¿Cuánto cuesta operarlo y qué margen deja? | [`economia/unit-economics.md`](economia/unit-economics.md) |
| ¿Qué supuestos sostienen los cálculos? | [`economia/supuestos.md`](economia/supuestos.md) |
| ¿Cómo se vende? | [`ventas/proceso.md`](ventas/proceso.md) |
| ¿Cómo se cotiza? | [`ventas/cotizacion.md`](ventas/cotizacion.md) |
| ¿Qué mensaje se comunica? | [`marketing/mensaje.md`](marketing/mensaje.md) |
| ¿Qué evidencia de mercado se debe producir? | [`marketing/experimentos.md`](marketing/experimentos.md) |
| ¿Qué verticales y volumen se prueban? | [`marketing/verticales.md`](marketing/verticales.md) |
| ¿Cómo se activa y opera un cliente? | [`operaciones/onboarding.md`](operaciones/onboarding.md) |
| ¿Cómo se centraliza la factura? | [`operaciones/facturacion-canal.md`](operaciones/facturacion-canal.md) |
| ¿Qué se mide? | [`operaciones/metricas.md`](operaciones/metricas.md) |
| ¿Qué formalización se necesita en Perú? | [`legal/formalizacion-peru.md`](legal/formalizacion-peru.md) |
| ¿Qué condiciones comerciales van al contrato? | [`legal/condiciones.md`](legal/condiciones.md) |

## Decisiones operativas del piloto

1. La unidad de facturación mensual es **un número de WhatsApp**.
2. Los planes finales con IGV son Starter S/149/150 chats, Basic S/379/300, Pro S/749/500 y Premium S/2,499/1,500.
3. Un número adicional paga el precio completo de su propio plan. **No existe descuento mensual recurrente por cantidad de números.**
4. Al lanzamiento, AIbot cobra por adelantado, paga Twilio y este liquida Meta; la guarda de respuestas protege margen.
5. Demo gratuita en número AIbot; piloto vivo de un mes paga S/250 de activación más el plan. El prepago estándar de 3/6/12 meses exonera setup y protege la economía definida en la política.
6. S/700 es el sueldo mensual de un operador indicado por el fundador para comparar valor; no es un costo operativo de la IA.
7. Cloud API directa con cobro centralizado queda para cuando AIbot tenga crédito/pago compartido elegible.

## Estado de evidencia

- **Verificado en código:** modelos de IA, límites de salida, resumen periódico, infraestructura Cloud Run y registro de uso de texto.
- **Verificado externamente:** precios publicados de OpenAI, planes de Supabase y reglas tributarias generales de SUNAT enlazadas en los nodos.
- **Verificado externamente:** precios post-1-oct-2026 de Meta y planes publicados de YaVendió, enlazados en los nodos.
- **Pendiente de datos reales:** P50/P90 de respuestas, mezcla de medios, soporte, costo Meta por número, conversión, churn y disposición a pagar.
