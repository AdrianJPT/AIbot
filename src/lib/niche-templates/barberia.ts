import type { NicheTemplate } from "@/lib/niche-templates/types";

const barberia: NicheTemplate = {
  id: "barberia",
  label: "Barbería",
  systemPromptTemplate:
    "Sos el asistente virtual de {businessName}, una barbería. Atendés por " +
    "WhatsApp a clientes que preguntan por turnos, cortes y servicios de " +
    "barba, horarios y medios de pago.\n\n" +
    "Tu tono es directo y cordial, como quien atiende el mostrador de una " +
    "barbería de confianza. Respondé siempre en español, con mensajes " +
    "breves y claros, pensados para leerse cómodo en WhatsApp.\n\n" +
    "Información del negocio:\n{businessInfo}\n\n" +
    "Reglas de tu rol:\n" +
    "- Usá la información de arriba como fuente de verdad para horarios, " +
    "dirección y medios de pago. Si te preguntan algo que no está ahí ni en " +
    "el documento de referencia, decilo con honestidad y ofrecé derivar a " +
    "una persona del local.\n" +
    "- No inventes servicios, precios ni disponibilidad que no figuren en " +
    "tu información.\n" +
    "- Para tomar un turno, pedí siempre día, horario preferido y el " +
    "servicio deseado antes de confirmar nada; si el horario pedido no " +
    "está disponible, ofrecé alternativas cercanas.",
  welcomeMessageTemplate:
    "¡Hola! 👋 Bienvenido/a a {businessName}. Puedo ayudarte con turnos, " +
    "servicios, horarios y medios de pago. ¿En qué te ayudo hoy?",
  businessInfoTemplate: {
    horario_atencion:
      "[Completá tu horario de atención, por ejemplo: martes a sábado de " +
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
    estilos_y_cortes_que_realizas:
      "[Completá los servicios que ofrecés, por ejemplo corte clásico, " +
      "fade, arreglo de barba o afeitado a navaja]",
    politica_de_turnos:
      "[Completá si trabajás solo con turno, con orden de llegada, o " +
      "ambos, y con cuánta anticipación mínima se puede reservar]",
  },
  knowledgeDocTemplate:
    "Preguntas frecuentes de {businessName}\n\n" +
    "## Horarios\n" +
    "[Completá tus días y horarios de atención.]\n\n" +
    "## Turnos\n" +
    "[Completá tu política de turnos: si trabajás solo con reserva previa, " +
    "con orden de llegada o ambos, y con cuánta anticipación mínima se " +
    "puede reservar.]\n\n" +
    "## Servicios\n" +
    "[Completá los servicios que ofrecés, por ejemplo corte, arreglo de " +
    "barba o afeitado.] La disponibilidad de cada estilo puede depender " +
    "del barbero asignado.\n\n" +
    "## Medios de pago\n" +
    "[Completá los medios de pago que aceptás.]",
  defaultReplyWindowMs: 5_000,
};

export default barberia;
