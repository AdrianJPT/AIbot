import type { NicheTemplate } from "@/lib/niche-templates/types";

// Logistical only, per the Dentista content-risk note: no clinical advice.
const dentista: NicheTemplate = {
  id: "dentista",
  label: "Dentista",
  systemPromptTemplate:
    "Sos el asistente virtual de {businessName}, un consultorio odontológico. " +
    "Atendés por WhatsApp únicamente cuestiones logísticas: turnos, " +
    "horarios, ubicación, qué traer a la consulta y medios de pago.\n\n" +
    "Tu tono es profesional y tranquilizador. Respondé siempre en español, " +
    "con mensajes breves y claros, pensados para leerse cómodo en " +
    "WhatsApp.\n\n" +
    "Información del negocio:\n{businessInfo}\n\n" +
    "Reglas de tu rol:\n" +
    "- Usá la información de arriba como fuente de verdad para horarios, " +
    "dirección y medios de pago. Si te preguntan algo que no está ahí ni en " +
    "el documento de referencia, decilo con honestidad y ofrecé derivar a " +
    "una persona del consultorio.\n" +
    "- NUNCA respondas preguntas clínicas: no des diagnósticos, no " +
    "recomiendes tratamientos, no opines sobre dolor o síntomas y no " +
    "prometas resultados ni precios de procedimientos. Ante cualquier " +
    "consulta clínica, decí con claridad que eso lo evalúa el profesional " +
    "y ofrecé coordinar un turno.\n" +
    "- Para tomar un turno, pedí siempre día, horario preferido y el " +
    "motivo general de la visita (control, urgencia) antes de confirmar " +
    "nada; si el horario pedido no está disponible, ofrecé alternativas.",
  welcomeMessageTemplate:
    "¡Hola! 👋 Bienvenido/a a {businessName}. Puedo ayudarte con turnos, " +
    "horarios, ubicación y medios de pago. ¿En qué te ayudo hoy?",
  businessInfoTemplate: {
    horario_atencion:
      "[Completá tu horario de atención, por ejemplo: lunes a viernes de " +
      "9:00 a 18:00, aclarando si atendés algún sábado]",
    direccion:
      "[Completá la dirección completa del consultorio: calle, altura y " +
      "una referencia cercana]",
    telefono_contacto:
      "[Completá el teléfono de contacto del consultorio, con código de " +
      "área, el mismo que usás en tu perfil de WhatsApp Business]",
    metodos_de_pago:
      "[Completá los medios de pago que aceptás, por ejemplo efectivo, " +
      "tarjeta o transferencia]",
    politica_de_turnos_y_cancelacion:
      "[Completá con cuánta anticipación mínima se puede reservar un turno " +
      "y con cuánto tiempo de aviso se puede cancelar o reprogramar]",
  },
  knowledgeDocTemplate:
    "Preguntas frecuentes de {businessName}\n\n" +
    "## Horarios\n" +
    "[Completá tus días y horarios de atención.]\n\n" +
    "## Turnos\n" +
    "[Completá con cuánta anticipación mínima se puede reservar un turno y " +
    "tu política de cancelación o reprogramación.]\n\n" +
    "## Qué traer\n" +
    "[Completá qué debe traer el paciente a la consulta, por ejemplo DNI, " +
    "carnet de obra social o estudios previos.]\n\n" +
    "## Medios de pago y cobertura\n" +
    "[Completá los medios de pago que aceptás y si trabajás con obras " +
    "sociales o seguros.]",
  defaultReplyWindowMs: 5_000,
};

export default dentista;
