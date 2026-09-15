import type { NicheTemplate } from "@/lib/niche-templates/types";

const gimnasio: NicheTemplate = {
  id: "gimnasio",
  label: "Gimnasio",
  systemPromptTemplate:
    "Sos el asistente virtual de {businessName}, un gimnasio. Atendés por " +
    "WhatsApp a personas que preguntan por planes, clases, horarios y " +
    "medios de pago.\n\n" +
    "Tu tono es enérgico y cordial, transmitiendo la misma motivación que " +
    "se vive en el gimnasio. Respondé siempre en español, con mensajes " +
    "breves y claros, pensados para leerse cómodo en WhatsApp.\n\n" +
    "Información del negocio:\n{businessInfo}\n\n" +
    "Reglas de tu rol:\n" +
    "- Usá la información de arriba como fuente de verdad para horarios, " +
    "dirección, planes y medios de pago. Si te preguntan algo que no está " +
    "ahí ni en el documento de referencia, decilo con honestidad y ofrecé " +
    "derivar a una persona del gimnasio.\n" +
    "- No inventes planes, precios ni clases que no figuren en tu " +
    "información; no des recomendaciones de entrenamiento ni de salud, " +
    "solo información logística.\n" +
    "- Para inscribir a alguien en una clase, pedí siempre la clase " +
    "deseada, día y horario preferido antes de confirmar nada; si el " +
    "horario pedido no está disponible, ofrecé alternativas cercanas.",
  welcomeMessageTemplate:
    "¡Hola! 👋 Bienvenido/a a {businessName}. Puedo ayudarte con planes, " +
    "clases, horarios y medios de pago. ¿En qué te ayudo hoy?",
  businessInfoTemplate: {
    horario_atencion:
      "[Completá tu horario de atención, por ejemplo: lunes a sábado de " +
      "7:00 a 22:00, aclarando qué día permanecés cerrado]",
    direccion:
      "[Completá la dirección completa del gimnasio: calle, altura y una " +
      "referencia cercana]",
    telefono_contacto:
      "[Completá el teléfono de contacto del gimnasio, con código de área, " +
      "el mismo que usás en tu perfil de WhatsApp Business]",
    metodos_de_pago:
      "[Completá los medios de pago que aceptás, por ejemplo efectivo, " +
      "tarjeta o débito automático]",
    planes_y_clases_ofrecidas:
      "[Completá los planes y clases que ofrecés, por ejemplo musculación, " +
      "funcional o clases grupales]",
    politica_de_inscripcion_y_baja:
      "[Completá cómo se inscribe alguien nuevo y con cuánto tiempo de " +
      "aviso se puede dar de baja el plan]",
    horarios_de_clases_grupales:
      "[Completá los días y horarios de las clases grupales, por ejemplo " +
      "funcional, spinning o yoga, y si requieren inscripción previa]",
    servicios_adicionales:
      "[Completá si ofrecés servicios adicionales como entrenamiento " +
      "personalizado, evaluación física o asesoramiento nutricional]",
  },
  knowledgeDocTemplate:
    "Preguntas frecuentes de {businessName}\n\n" +
    "## Horarios\n" +
    "[Completá tus días y horarios de atención.]\n\n" +
    "## Planes\n" +
    "[Completá los planes que ofrecés y qué incluye cada uno.]\n\n" +
    "## Clases\n" +
    "[Completá los días y horarios de las clases grupales disponibles y si " +
    "requieren inscripción previa.]\n\n" +
    "## Primera visita\n" +
    "[Completá si ofrecés una clase de prueba o día gratuito, y qué debe " +
    "traer una persona nueva, por ejemplo apto físico o ropa deportiva.]\n\n" +
    "## Servicios adicionales\n" +
    "[Completá si ofrecés entrenamiento personalizado, evaluación física o " +
    "asesoramiento nutricional.]\n\n" +
    "## Medios de pago\n" +
    "[Completá los medios de pago que aceptás y tu política de baja.]",
  defaultReplyWindowMs: 5_000,
};

export default gimnasio;
