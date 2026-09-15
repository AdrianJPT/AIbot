import type { NicheTemplate } from "@/lib/niche-templates/types";

// Prices and availability change constantly, per the sensitive-giro content
// note: never present them as fact, always confirm with a person.
const inmobiliaria: NicheTemplate = {
  id: "inmobiliaria",
  label: "Inmobiliaria",
  systemPromptTemplate:
    "Sos el asistente virtual de {businessName}, una inmobiliaria. Atendés " +
    "por WhatsApp a personas que preguntan por propiedades, visitas, " +
    "horarios y medios de contacto.\n\n" +
    "Tu tono es profesional y cordial. Respondé siempre en español, con " +
    "mensajes breves y claros, pensados para leerse cómodo en WhatsApp.\n\n" +
    "Información del negocio:\n{businessInfo}\n\n" +
    "Reglas de tu rol:\n" +
    "- Usá la información de arriba como fuente de verdad para horarios, " +
    "dirección y medios de pago. Si te preguntan algo que no está ahí ni " +
    "en el documento de referencia, decilo con honestidad y ofrecé " +
    "derivar a una persona de la inmobiliaria.\n" +
    "- Los precios y la disponibilidad de las propiedades cambian " +
    "constantemente: nunca los presentes como un dato firme. Decí siempre " +
    "que hay que confirmarlos con una persona del equipo antes de " +
    "avanzar.\n" +
    "- No inventes propiedades, precios, comisiones ni condiciones que no " +
    "figuren en tu información.\n" +
    "- Para coordinar una visita, pedí siempre la propiedad de interés, " +
    "día y horario preferido antes de confirmar nada, aclarando que la " +
    "confirmación final la hace una persona del equipo.",
  welcomeMessageTemplate:
    "¡Hola! 👋 Bienvenido/a a {businessName}. Puedo ayudarte con " +
    "propiedades, visitas, horarios y medios de contacto. ¿En qué te " +
    "ayudo hoy?",
  businessInfoTemplate: {
    horario_atencion:
      "[Completá tu horario de atención, por ejemplo: lunes a viernes de " +
      "9:00 a 18:00, aclarando si atendés los sábados]",
    direccion:
      "[Completá la dirección completa de la oficina: calle, altura y una " +
      "referencia cercana]",
    telefono_contacto:
      "[Completá el teléfono de contacto de la inmobiliaria, con código " +
      "de área, el mismo que usás en tu perfil de WhatsApp Business]",
    medios_de_pago_y_comisiones:
      "[Completá los medios de pago que aceptás y cómo se manejan las " +
      "comisiones, sin montos fijos]",
    tipos_de_propiedades_gestionadas:
      "[Completá los tipos de propiedades que gestionás, por ejemplo " +
      "departamentos, casas o locales, en venta o alquiler]",
    politica_de_visitas:
      "[Completá cómo se coordina una visita y con cuánta anticipación " +
      "hay que solicitarla]",
  },
  knowledgeDocTemplate:
    "Preguntas frecuentes de {businessName}\n\n" +
    "## Horarios\n" +
    "[Completá tus días y horarios de atención.]\n\n" +
    "## Visitas\n" +
    "[Completá cómo se coordina una visita a una propiedad y con cuánta " +
    "anticipación.]\n\n" +
    "## Propiedades\n" +
    "[Completá los tipos de propiedades que gestionás.] Los precios y la " +
    "disponibilidad se confirman siempre con una persona del equipo antes " +
    "de cualquier acuerdo.\n\n" +
    "## Medios de pago\n" +
    "[Completá los medios de pago que aceptás y cómo se manejan las " +
    "comisiones.]",
  defaultReplyWindowMs: 5_000,
};

export default inmobiliaria;
