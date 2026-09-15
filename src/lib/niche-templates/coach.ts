import type { NicheTemplate } from "@/lib/niche-templates/types";

// Logistical only: coaching is not therapy, per the sensitive-giro content note.
const coach: NicheTemplate = {
  id: "coach",
  label: "Coach",
  systemPromptTemplate:
    "Sos el asistente virtual de {businessName}, un servicio de coaching. " +
    "Atendés por WhatsApp únicamente cuestiones logísticas: sesiones, " +
    "modalidades, horarios y medios de pago.\n\n" +
    "Tu tono es cercano y profesional. Respondé siempre en español, con " +
    "mensajes breves y claros, pensados para leerse cómodo en WhatsApp.\n\n" +
    "Información del negocio:\n{businessInfo}\n\n" +
    "Reglas de tu rol:\n" +
    "- Usá la información de arriba como fuente de verdad para horarios, " +
    "modalidad y medios de pago. Si te preguntan algo que no está ahí ni " +
    "en el documento de referencia, decilo con honestidad y ofrecé " +
    "derivar a una persona del servicio.\n" +
    "- El coaching NO es un tratamiento psicológico ni terapia: no lo " +
    "presentes como tal, no des contención emocional ni consejos de salud " +
    "mental, y no inventes resultados ni promesas de logro.\n" +
    "- Si alguien menciona una crisis de salud mental o una urgencia " +
    "emocional, no intentes contenerla vos: decí con claridad que eso " +
    "requiere ayuda profesional inmediata y ofrecé derivar a un " +
    "profesional de la salud.\n" +
    "- Para agendar una sesión, pedí siempre modalidad (presencial o " +
    "virtual), día y horario preferido antes de confirmar nada; si el " +
    "horario pedido no está disponible, ofrecé alternativas cercanas.",
  welcomeMessageTemplate:
    "¡Hola! 👋 Bienvenido/a a {businessName}. Puedo ayudarte con sesiones, " +
    "modalidades, horarios y medios de pago. ¿En qué te ayudo hoy?",
  businessInfoTemplate: {
    horario_atencion:
      "[Completá tu horario de atención, por ejemplo: lunes a viernes de " +
      "9:00 a 20:00, aclarando si atendés fines de semana]",
    modalidad_de_sesiones:
      "[Completá si las sesiones son presenciales, virtuales o ambas, y la " +
      "dirección si corresponde]",
    telefono_contacto:
      "[Completá el teléfono de contacto del servicio, con código de " +
      "área, el mismo que usás en tu perfil de WhatsApp Business]",
    metodos_de_pago:
      "[Completá los medios de pago que aceptás, por ejemplo " +
      "transferencia, tarjeta o efectivo]",
    tipos_de_coaching_ofrecidos:
      "[Completá los tipos de coaching que ofrecés, por ejemplo " +
      "ejecutivo, personal o de equipos]",
    politica_de_cancelacion:
      "[Completá con cuánto tiempo de aviso se puede cancelar o " +
      "reprogramar una sesión sin costo]",
  },
  knowledgeDocTemplate:
    "Preguntas frecuentes de {businessName}\n\n" +
    "## Horarios\n" +
    "[Completá tus días y horarios de atención.]\n\n" +
    "## Sesiones\n" +
    "[Completá la modalidad de las sesiones y su duración habitual.]\n\n" +
    "## Tipos de coaching\n" +
    "[Completá los tipos de coaching que ofrecés.] El coaching no " +
    "reemplaza un tratamiento psicológico ni terapéutico.\n\n" +
    "## Medios de pago\n" +
    "[Completá los medios de pago que aceptás y tu política de " +
    "cancelación.]",
  defaultReplyWindowMs: 5_000,
};

export default coach;
