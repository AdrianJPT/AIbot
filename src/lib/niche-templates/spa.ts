import type { NicheTemplate } from "@/lib/niche-templates/types";

const spa: NicheTemplate = {
  id: "spa",
  label: "Spa",
  systemPromptTemplate:
    "Sos el asistente virtual de {businessName}, un spa. Atendés por " +
    "WhatsApp a clientes que preguntan por turnos, masajes y tratamientos, " +
    "horarios y medios de pago.\n\n" +
    "Tu tono es calmo y cordial, transmitiendo la misma tranquilidad que " +
    "ofrece el espacio. Respondé siempre en español, con mensajes breves y " +
    "claros, pensados para leerse cómodo en WhatsApp.\n\n" +
    "Información del negocio:\n{businessInfo}\n\n" +
    "Reglas de tu rol:\n" +
    "- Usá la información de arriba como fuente de verdad para horarios, " +
    "dirección y medios de pago. Si te preguntan algo que no está ahí ni en " +
    "el documento de referencia, decilo con honestidad y ofrecé derivar a " +
    "una persona del local.\n" +
    "- No inventes tratamientos, precios ni beneficios que no figuren en tu " +
    "información; no des recomendaciones de salud, solo información " +
    "logística del servicio.\n" +
    "- Para tomar un turno, pedí siempre el tratamiento deseado, día y " +
    "horario preferido antes de confirmar nada; si el horario pedido no " +
    "está disponible, ofrecé alternativas cercanas.",
  welcomeMessageTemplate:
    "¡Hola! 👋 Bienvenido/a a {businessName}. Puedo ayudarte con turnos, " +
    "tratamientos, horarios y medios de pago. ¿En qué te ayudo hoy?",
  businessInfoTemplate: {
    horario_atencion:
      "[Completá tu horario de atención, por ejemplo: lunes a sábado de " +
      "10:00 a 20:00, aclarando qué día permanecés cerrado]",
    direccion:
      "[Completá la dirección completa del local: calle, altura y una " +
      "referencia cercana]",
    telefono_contacto:
      "[Completá el teléfono de contacto del local, con código de área, el " +
      "mismo que usás en tu perfil de WhatsApp Business]",
    metodos_de_pago:
      "[Completá los medios de pago que aceptás, por ejemplo efectivo, " +
      "tarjeta o billeteras virtuales]",
    tratamientos_y_masajes_ofrecidos:
      "[Completá los tratamientos que ofrecés, por ejemplo masajes, " +
      "faciales o circuitos de relax]",
    politica_de_turnos_y_cancelacion:
      "[Completá con cuánta anticipación mínima se puede reservar un turno " +
      "y con cuánto tiempo de aviso se puede cancelar sin costo]",
    duracion_estimada_por_tratamiento:
      "[Completá cuánto dura en promedio cada tratamiento, por ejemplo un " +
      "masaje frente a un circuito completo]",
    bonos_y_atencion_para_parejas_o_grupos:
      "[Completá si vendés bonos o vouchers de regalo y si ofrecés " +
      "tratamientos para parejas o grupos]",
  },
  knowledgeDocTemplate:
    "Preguntas frecuentes de {businessName}\n\n" +
    "## Horarios\n" +
    "[Completá tus días y horarios de atención.]\n\n" +
    "## Turnos\n" +
    "[Completá con cuánta anticipación mínima se puede reservar un turno y " +
    "tu política de cancelación.] [Completá cuánto dura en promedio cada " +
    "tratamiento, para ayudar a coordinar el horario.]\n\n" +
    "## Tratamientos\n" +
    "[Completá los tratamientos que ofrecés y si hay recomendaciones " +
    "previas a la sesión, por ejemplo llegar unos minutos antes o evitar " +
    "exposición solar.]\n\n" +
    "## Bonos, regalos y grupos\n" +
    "[Completá si vendés bonos o vouchers de regalo, y si ofrecés " +
    "tratamientos para parejas o grupos y cómo se coordinan.]\n\n" +
    "## Medios de pago\n" +
    "[Completá los medios de pago que aceptás.]\n\n" +
    "## Otros datos útiles\n" +
    "[Completá otros datos que suelen preguntar tus clientes, por ejemplo " +
    "si hay vestuarios, si conviene venir sin maquillaje o si hay alguna " +
    "restricción de edad para ciertos tratamientos.]",
  defaultReplyWindowMs: 5_000,
};

export default spa;
