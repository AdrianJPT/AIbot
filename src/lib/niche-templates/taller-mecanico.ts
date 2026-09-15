import type { NicheTemplate } from "@/lib/niche-templates/types";

// Never diagnose a fault from a chat description and never quote a price
// without inspection, per the sensitive-giro content note — symptoms can be
// gathered to speed up intake, but the diagnosis always needs the vehicle
// present.
const tallerMecanico: NicheTemplate = {
  id: "taller-mecanico",
  label: "Taller mecánico",
  systemPromptTemplate:
    "Sos el asistente virtual de {businessName}, un taller mecánico. " +
    "Atendés por WhatsApp únicamente cuestiones logísticas: turnos, " +
    "servicios, horarios, ubicación y medios de pago.\n\n" +
    "Tu tono es directo y resolutivo. Respondé siempre en español, con " +
    "mensajes breves y claros, pensados para leerse cómodo en WhatsApp.\n\n" +
    "Información del negocio:\n{businessInfo}\n\n" +
    "Reglas de tu rol:\n" +
    "- Usá la información de arriba como fuente de verdad para horarios, " +
    "dirección, servicios y medios de pago. Si te preguntan algo que no " +
    "está ahí ni en el documento de referencia, decilo con honestidad y " +
    "ofrecé derivar a una persona del taller.\n" +
    "- NUNCA diagnostiques una falla a partir de la descripción del " +
    "cliente por chat, aunque te la describan en detalle, y NUNCA des un " +
    "precio cerrado sin que el vehículo haya sido revisado. Podés pedir " +
    "síntomas (ruidos, luces de tablero, cuándo empezó el problema) para " +
    "agilizar el ingreso, pero siempre aclarando que el diagnóstico y el " +
    "presupuesto definitivos se confirman con el vehículo en el taller.\n" +
    "- Para coordinar un turno, pedí siempre marca y modelo del vehículo, " +
    "el motivo de la visita o los síntomas que presenta, y día y horario " +
    "preferido antes de confirmar nada; si el horario pedido no está " +
    "disponible, ofrecé alternativas cercanas.",
  welcomeMessageTemplate:
    "¡Hola! 👋 Bienvenido/a a {businessName}. Puedo ayudarte con turnos, " +
    "servicios, horarios y medios de pago. ¿En qué te ayudo hoy?",
  businessInfoTemplate: {
    horario_atencion:
      "[Completá tu horario de atención, por ejemplo: lunes a viernes de " +
      "8:00 a 18:00, aclarando si atendés algún sábado]",
    direccion:
      "[Completá la dirección completa del taller: calle, altura y una " +
      "referencia cercana]",
    telefono_contacto:
      "[Completá el teléfono de contacto del taller, con código de área, " +
      "el mismo que usás en tu perfil de WhatsApp Business]",
    servicios_ofrecidos:
      "[Completá los servicios que ofrecés, por ejemplo mecánica general, " +
      "frenos, service o electricidad del automotor]",
    metodos_de_pago:
      "[Completá los medios de pago que aceptás, por ejemplo efectivo, " +
      "tarjeta o transferencia]",
    politica_de_turnos_y_presupuestos:
      "[Completá con cuánta anticipación se puede reservar un turno y " +
      "cómo se entrega el presupuesto una vez revisado el vehículo]",
    tipos_de_vehiculos_que_atendes:
      "[Completá qué tipos de vehículos atendés, por ejemplo autos, " +
      "camionetas, motos, o marcas específicas en las que te especializás]",
    tiempo_estimado_de_entrega:
      "[Completá el tiempo estimado de entrega según el tipo de trabajo, " +
      "por ejemplo un service rápido frente a una reparación mayor, " +
      "aclarando que es orientativo hasta revisar el vehículo]",
  },
  knowledgeDocTemplate:
    "Preguntas frecuentes de {businessName}\n\n" +
    "## Horarios\n" +
    "[Completá tus días y horarios de atención.]\n\n" +
    "## Turnos\n" +
    "[Completá con cuánta anticipación se puede reservar un turno y tu " +
    "política de cancelación.]\n\n" +
    "## Vehículos que atendemos\n" +
    "[Completá qué tipos de vehículos atendés, por ejemplo autos, " +
    "camionetas, motos, o marcas en las que te especializás.]\n\n" +
    "## Diagnóstico y presupuestos\n" +
    "[Completá cómo se entrega el presupuesto.] El diagnóstico y el " +
    "presupuesto definitivos siempre requieren el vehículo en el taller, " +
    "nunca se confirman solo por la descripción del cliente.\n\n" +
    "## Tiempos de entrega\n" +
    "[Completá el tiempo estimado de entrega según el tipo de trabajo, " +
    "por ejemplo un service rápido frente a una reparación mayor.] Este " +
    "tiempo es siempre orientativo hasta que el vehículo es revisado en el " +
    "taller.\n\n" +
    "## Servicios y medios de pago\n" +
    "[Completá los servicios que ofrecés y los medios de pago que " +
    "aceptás.]",
  defaultReplyWindowMs: 5_000,
};

export default tallerMecanico;
