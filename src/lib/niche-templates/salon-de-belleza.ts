import type { NicheTemplate } from "@/lib/niche-templates/types";

const salonDeBelleza: NicheTemplate = {
  id: "salon-de-belleza",
  label: "Salón de belleza",
  systemPromptTemplate:
    "Sos el asistente virtual de {businessName}, un salón de belleza. " +
    "Atendés por WhatsApp a clientes que preguntan por turnos, servicios de " +
    "peluquería y estética, horarios y medios de pago.\n\n" +
    "Tu tono es amable y prolijo, como quien recibe a los clientes en la " +
    "recepción del salón. Respondé siempre en español, con mensajes breves " +
    "y claros, pensados para leerse cómodo en WhatsApp.\n\n" +
    "Información del negocio:\n{businessInfo}\n\n" +
    "Reglas de tu rol:\n" +
    "- Usá la información de arriba como fuente de verdad para horarios, " +
    "dirección y medios de pago. Si te preguntan algo que no está ahí ni en " +
    "el documento de referencia, decilo con honestidad y ofrecé derivar a " +
    "una persona del local.\n" +
    "- No inventes servicios, precios ni disponibilidad que no figuren en " +
    "tu información.\n" +
    "- Para tomar un turno, pedí siempre el servicio deseado, día y " +
    "horario preferido antes de confirmar nada; si el horario pedido no " +
    "está disponible, ofrecé alternativas cercanas.",
  welcomeMessageTemplate:
    "¡Hola! 👋 Bienvenido/a a {businessName}. Puedo ayudarte con turnos, " +
    "servicios, horarios y medios de pago. ¿En qué te ayudo hoy?",
  businessInfoTemplate: {
    horario_atencion:
      "[Completá tu horario de atención, por ejemplo: martes a sábado de " +
      "9:00 a 19:00, aclarando qué día permanecés cerrado]",
    direccion:
      "[Completá la dirección completa del local: calle, altura y una " +
      "referencia cercana]",
    telefono_contacto:
      "[Completá el teléfono de contacto del local, con código de área, el " +
      "mismo que usás en tu perfil de WhatsApp Business]",
    metodos_de_pago:
      "[Completá los medios de pago que aceptás, por ejemplo efectivo, " +
      "tarjeta o billeteras virtuales]",
    servicios_de_belleza_ofrecidos:
      "[Completá los servicios que ofrecés, por ejemplo corte, color, " +
      "peinado, manicura o tratamientos capilares]",
    politica_de_turnos_y_cancelacion:
      "[Completá con cuánta anticipación mínima se puede reservar un turno " +
      "y con cuánto tiempo de aviso se puede cancelar sin costo]",
  },
  knowledgeDocTemplate:
    "Preguntas frecuentes de {businessName}\n\n" +
    "## Horarios\n" +
    "[Completá tus días y horarios de atención.]\n\n" +
    "## Turnos\n" +
    "[Completá con cuánta anticipación mínima se puede reservar un turno y " +
    "tu política de cancelación.]\n\n" +
    "## Servicios\n" +
    "[Completá los servicios que ofrecés y las marcas o productos que " +
    "usás.] La duración puede variar según el estilista asignado y el " +
    "estado del cabello o la piel.\n\n" +
    "## Medios de pago\n" +
    "[Completá los medios de pago que aceptás.]",
  defaultReplyWindowMs: 5_000,
};

export default salonDeBelleza;
