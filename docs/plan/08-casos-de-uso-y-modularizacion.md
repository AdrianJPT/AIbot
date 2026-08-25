# Casos de uso por vertical y modularización del producto

Documento de decisión. Responde tres preguntas:

1. ¿Qué le vendemos a cada tipo de negocio, más allá de "un chatbot"?
2. ¿Qué comparten todos los negocios y qué es propio de cada uno?
3. ¿Eso vive hardcodeado, o se maneja por UI como módulos activables?

---

## 1. De qué partimos (estado real del código, agosto 2026)

Lo que **ya existe y funciona**:

| Capacidad                                              | Dónde                                              |
| ------------------------------------------------------ | -------------------------------------------------- |
| Multi-tenant: negocio → números → conversaciones        | `prisma/schema.prisma`, `src/lib/scope.ts`         |
| Respuesta con conocimiento del negocio                  | `src/lib/prompt.ts` (`knowledgeDoc` + `businessInfo`) |
| Audio (Whisper), imagen (visión), ubicación             | `src/lib/media.ts`, `src/lib/message-handler.ts`   |
| Batching de mensajes seguidos (`replyWindowMs`)         | `src/lib/reply-window-scheduler.ts`                |
| Memoria: historial + resumen rodante                    | `src/lib/ai/summarize.ts`                          |
| Traspaso a humano + bandeja unificada                   | `/conversations`, `handoff`                        |
| Multi-número / multi-sucursal                           | `model PhoneNumber`                                |
| Techo de gasto diario por negocio                       | `Business.dailyAiLimit`                            |
| Fallback entre proveedores de IA                        | `src/lib/ai/resolve.ts`                            |
| **Verificación de comprobantes de pago**                | `src/lib/payments/*` (flag `paymentsEnabled`)      |
| Ingesta durable con reintentos (outbox)                 | `src/lib/outbox/*`                                 |

Lo que **no existe** y hoy se suple con prosa en el prompt:

- **El bot no ejecuta acciones.** `generateResponse` no usa tool-calling
  (`src/lib/ai/generate.ts`). El bot pide "nombre, servicio, fecha y hora" y
  alguien lo carga a mano en el panel. La cita nunca se crea sola.
- **`Appointment` no es una agenda.** `date` y `time` son `String`, no hay
  duración, ni recurso (barbero, mesa, sala), ni restricción contra doble
  reserva. Sirve como registro, no como calendario.
- **No hay mensajes salientes programados.** Sin recordatorios, sin
  reactivación, sin campañas.
- **`CatalogItem` no tiene UI** — se carga por `prisma/seed-catalog.ts`.
- **`paymentsEnabled` no está en el formulario de negocio** — es un flag
  que hoy solo se prende por base de datos.
- **`businessInfo` es un textarea de JSON crudo** en el form. Eso no es un
  onboarding de 20 minutos para un dueño de barbería.

Esa lista es, exactamente, la distancia entre "vendo un chatbot" y "vendo
que el negocio funcione por WhatsApp".

---

## 2. El núcleo compartido: lo que **todos** quieren igual

El 70% del valor no depende del rubro. Es sobre la conversación, no sobre
el negocio.

1. **Contestar siempre, en segundos, 24/7** — incluye audios de 40 segundos
   y fotos. Ya está, y es más de lo que ofrece el 90% de la competencia local.
2. **Saber del negocio**: horarios, dirección, precios, políticas, FAQ.
3. **No perder al cliente**: traspaso a humano cuando hace falta, con todo
   el contexto a la vista.
4. **Memoria del cliente**: quién es, qué compró, cuándo vino.
5. **Captura de lead estructurado**: nombre, teléfono, qué quería. *(falta)*
6. **Recordatorios y seguimiento saliente** *(falta)*.
7. **Reporte al dueño**: cuántas consultas, cuántas terminaron en reserva o
   venta, qué preguntan más, qué no supo contestar *(falta)*.
8. **Cobro / verificación de pago** *(existe, apagado)*.

Los puntos 5, 6 y 7 son los que hay que construir primero, porque son
**transversales**: se construyen una vez y los usan todos los rubros.

> El 7 en particular es el que retiene. El dueño no ve el ahorro de tiempo,
> lo naturaliza en dos semanas. El reporte semanal es lo que le recuerda
> todos los lunes por qué paga.

---

## 3. Lo específico por rubro

Mirando los verticales de a uno, todo lo "propio" se reduce a **tres
motores**. Un rubro no es código nuevo: es qué motores tiene prendidos y con
qué parámetros.

| Motor            | Qué hace                                                     | Estado          |
| ---------------- | ------------------------------------------------------------ | --------------- |
| **Conocimiento** | Responder desde el material del negocio                      | ✅ existe       |
| **Agenda**       | Reservar un bloque de tiempo sobre un recurso                 | ❌ falta        |
| **Transacción**  | Catálogo → pedido → total → cobro → comprobante verificado    | 🟡 mitad (pagos)|
| *Salida*         | Recordatorios, reactivación, campañas (transversal)           | ❌ falta        |
| *Datos*          | Ficha de cliente + reportes (transversal)                     | ❌ falta        |

El motor de agenda es **uno solo**. Lo que cambia entre rubros son tres
parámetros: qué es el recurso, cuánto dura la unidad, y si hay capacidad
simultánea.

| Rubro        | Recurso        | Unidad         | Capacidad |
| ------------ | -------------- | -------------- | --------- |
| Barbería     | barbero        | 30–60 min      | 1         |
| Restaurante  | mesa           | franja horaria | comensales|
| Consultorio  | profesional    | 20–40 min      | 1         |
| Hotel        | habitación     | noche          | 1         |
| Inmobiliaria | agente         | visita 45 min  | 1         |

### Barbería / estética / consultorio — negocios de agenda

El valor no es contestar: es **llenar la agenda y matar el no-show**.

- Reserva por chat con **disponibilidad real** (por profesional y servicio).
- **Recordatorio 24 h y 2 h antes** con botones *Confirmo / Reagendar /
  Cancelar*. Es la función de mayor retorno medible de toda la lista: un
  no-show del 25% baja a un dígito, y eso el dueño lo ve en plata.
- **Reagendar y cancelar sin llamar** — el hueco se libera solo.
- **Lista de espera**: se cancela un sábado 11:00, el bot le avisa a los que
  quedaron afuera. Recupera facturación que hoy se pierde entera.
- **Seña para reservar** = agenda + motor de pagos. "Para bloquear el sábado
  transferí $X" → el comprobante se verifica solo → la cita pasa a confirmada
  sin que nadie mire una captura. **Este es el combo que ya casi tenemos y
  que nadie más ofrece.**
- **Reactivación por ciclo**: "hace 5 semanas del último corte, ¿te agendo?".
  Es una consulta a la base de citas más un mensaje. Barato de construir,
  altísimo de vender.
- Preferencia de profesional guardada en la ficha.

### Restaurante — son dos negocios distintos

**Con salón → reservas.** Mesa, comensales, franja, confirmación,
recordatorio, lista de espera. Es el motor de agenda con recurso = mesa.

**Con delivery / take-away → pedidos.** Carta, armado del pedido, total,
dirección, medio de pago, comprobante verificado, estado del pedido. Es el
motor de transacción y ahí `CatalogItem` deja de ser decorativo.

Y una función chica que enamora en la demo:

- **Disponibilidad del día**: el dueño le escribe al bot "se acabó el pulpo"
  y el bot deja de ofrecerlo. Es una marca en el catálogo. Barato.
- **Upsell**: "¿le sumo postre?" — sube el ticket promedio, y es prompt.
- **Demora estimada** en horario pico.

### Otros verticales que valen (y por qué)

| Rubro          | Motores            | El gancho de venta                                  |
| -------------- | ------------------ | --------------------------------------------------- |
| Inmobiliaria   | Conocimiento+Agenda| Filtra curiosos: califica presupuesto/zona y agenda visita |
| Hotel          | Agenda+Transacción | Disponibilidad, tarifa y **seña verificada**        |
| Gimnasio       | Transacción+Salida | Cuota mensual con comprobante + aviso de vencimiento |
| Tienda chica   | Transacción        | Catálogo, pedido, comprobante, seguimiento          |
| Taller/servicio| Agenda+Salida      | Turno, presupuesto, "su auto está listo"            |
| Clínica        | Agenda+Salida      | Turnos + indicaciones previas *(ojo: datos de salud)* |

---

## 4. La pregunta de fondo no es "hardcode vs UI"

Es **qué es código y qué es dato**. Esa línea:

- **Código, nunca editable por UI**: los motores, las herramientas que el
  modelo puede ejecutar, el límite de confianza del prompt
  (`src/lib/prompt.ts`), el aislamiento entre tenants, la máquina de estados
  de pagos.
- **Dato, editable por UI**: qué motores están prendidos, sus parámetros
  (servicios, duraciones, recursos, horarios, precios, política de seña),
  el documento de conocimiento, el tono, los modelos.
- **Nunca por UI, de nadie**: nada que pueda ampliar el alcance de una
  herramienta o cruzar el aislamiento entre negocios.

Con esa línea, "personalizado por rubro" es un **preset de datos**, no una
rama de código. Y ahí sí se puede empaquetar y cobrar.

---

## 5. Tres approaches

### Approach A — Presets por rubro (rápido, sigue siendo chatbot)

Un catálogo de plantillas en el repo (`configs/*.json` ya es el embrión):
barbería, restaurante-salón, restaurante-delivery, hotel, inmobiliaria. El
onboarding es: elegir rubro → se copian `systemPrompt`, `knowledgeDoc`
esqueleto, `businessInfo` y flags a la fila `Business` → el dueño completa
un formulario guiado (no JSON crudo). Se agrega el switch de
`paymentsEnabled` al form.

- **Costo**: 1–2 semanas.
- **Onboarding**: 20–30 minutos por cliente, sin tocar código.
- **Gana**: velocidad, cero riesgo, cierra clientes ya.
- **Pierde**: seguís vendiendo un chatbot. Sin capacidades no hay módulos, y
  sin módulos no hay palanca de precio. Cada pedido raro es un deploy.
- **Cuándo**: si el objetivo de los próximos 60 días es cerrar los primeros
  10 clientes y facturar.

### Approach B — Módulos con capacidades reales, activables por UI ⭐

Se introduce **tool-calling** en `generate.ts`. Cada módulo registra sus
herramientas; el modelo las ejecuta contra la base con el mismo scope de
tenant que ya usa el panel.

- Tabla `BusinessModule` (`businessId`, `module`, `enabled`, `config Json`)
  + un registry en código. La UI prende/apaga y edita la config con un
  formulario por módulo, nunca JSON crudo.
- Módulos: `agenda`, `pedidos`, `pagos` (ya está), `recordatorios`,
  `crm-reportes`.
- **A no se tira: queda adentro de B.** El preset por rubro pasa a ser "qué
  módulos vienen prendidos y con qué config".
- **Precio**: plan base (conocimiento + handoff + bandeja) y add-ons por
  módulo. Los créditos son el consumo de IA — `dailyAiLimit` y el
  seguimiento de uso ya existen (`src/lib/credentials/usage.ts`).

**Lo que hay que hacer con cuidado**: las herramientas son acciones con
efectos, y el input viene de un canal no confiable. Toda escritura pide
confirmación explícita del cliente, es idempotente, y está acotada al
negocio. El límite de confianza de `prompt.ts` se extiende a las tools: el
mensaje del cliente **propone**, nunca autoriza.

- **Costo**: motor de agenda 2–3 semanas (incluye migrar `Appointment` a
  `DateTime` + recurso + duración + restricción anti-doble-reserva); cada
  módulo siguiente 1–1,5 semanas.
- **Gana**: es lo único que te deja decir "además de responder, **reserva,
  cobra y recuerda**", subir el ticket y no depender de tu tiempo.
- **Pierde**: toca el camino caliente (`message-handler`,
  `reply-window-scheduler`). Hay que testearlo como se testeó pagos.

### Approach C — Plataforma no-code (constructor de flujos + conectores)

Editor visual de flujos, conectores externos (Google Calendar, Sheets, POS),
marketplace, todo autoservicio.

- **Costo**: 4–6 meses antes del primer peso extra.
- **Gana**: techo alto, escala sin vos.
- **Pierde**: el dueño de la barbería **no va a armar un flujo**. Lo que él
  llama "personalizado" es que vos se lo dejes andando. Además el soporte se
  dispara: un flujo roto que armó el cliente igual te lo reclama a vos.
- **Cuándo**: recién con 50–100 clientes y patrones repetidos y demostrados.

---

## 6. Recomendación

**A ahora → B como camino → C solo si el mercado lo pide.**

Con una condición que hace toda la diferencia: hacer A **guardando el preset
como datos** (una fila de módulos con su config) en vez de como prosa dentro
de `systemPrompt`. Si se hace así, A no es un desvío — es la fase 0 de B, y
el día que se prende el motor de agenda los clientes de A ya están migrados.
Si se hace metiendo todo en el prompt, hay que rehacerlo entero.

Orden sugerido:

1. **Semanas 1–2 (A)**: presets por rubro + formulario guiado en vez de JSON
   crudo + switch de `paymentsEnabled` + `CatalogItem` con UI.
2. **Semanas 3–6 (B, módulo 1)**: motor de agenda. Migrar `Appointment`,
   tool-calling, reserva/reagendar/cancelar por chat. Es el módulo que abre
   barbería, consultorio, restaurante-salón, inmobiliaria y hotel de una.
3. **Semanas 7–9 (B, módulo 2)**: recordatorios y salientes. Depende de
   plantillas de Meta (ver riesgos). Es lo que convierte la agenda en menos
   no-show, o sea en plata visible.
4. **Semanas 10–12 (B, módulo 3)**: pedidos (catálogo → pedido → pago
   verificado) y el reporte semanal al dueño.

---

## 7. Riesgos y cuellos de botella conocidos

1. **Ventana de 24 h de Meta.** Fuera de las 24 h del último mensaje del
   cliente solo se puede escribir con **plantillas aprobadas**. Todo el
   módulo de recordatorios y reactivación depende de eso. Es proceso de
   aprobación, no código: hay que arrancarlo semanas antes de venderlo.
2. **Calidad compartida del portfolio.** Según
   `docs/ops/whatsapp-client-onboarding.md`, los límites de mensajería son a
   nivel portfolio: **un cliente que mande spam degrada a todos**. Antes de
   vender campañas hay que definir límites de envío por negocio y un corte
   automático por calidad.
3. **Alta de números.** Hoy el onboarding de WhatsApp es manual y el cliente
   pierde su app de WhatsApp Business. Para "plug and play" de verdad hay
   que evaluar Embedded Signup. Es el cuello real del onboarding — no el
   prompt.
4. **Verificación del negocio en Meta pendiente**: sin eso, tope de 2
   números en todo el portfolio. Es bloqueante para escalar más allá de los
   primeros clientes.
5. **Tool-calling y seguridad**: ver Approach B. Ninguna herramienta que
   escriba puede dispararse sin confirmación explícita del cliente.
6. **Costos de IA por módulo**: cada tool suma llamadas. `dailyAiLimit` es
   por negocio y hoy es un número plano; con módulos conviene medir el costo
   por módulo para poder tarifar.
