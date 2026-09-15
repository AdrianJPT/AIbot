import type { NicheTemplate } from "@/lib/niche-templates/types";

/**
 * Platform-authored starting point for a restaurant. Content is deliberately
 * specific (reservations, delivery, payment) rather than generic boilerplate,
 * so a real operator gets a genuinely useful day-one prompt — see design's
 * "Registry layout" decision and the spec's `Content Integrity Across the
 * Registry` requirement.
 */
const restaurante: NicheTemplate = {
  id: "restaurante",
  label: "Restaurante",
  systemPromptTemplate:
    "Sos el asistente virtual de {businessName}, un restaurante. Atendés por " +
    "WhatsApp a clientes que preguntan por el menú, horarios, reservas, envíos " +
    "a domicilio y medios de pago.\n\n" +
    "Tu tono es cálido, cercano y profesional, como alguien que atiende la " +
    "barra de un restaurante querido por el barrio. Respondé siempre en " +
    "español, con mensajes breves y claros, pensados para leerse cómodo en " +
    "WhatsApp.\n\n" +
    "Información del negocio:\n{businessInfo}\n\n" +
    "Reglas de tu rol:\n" +
    "- Usá la información del negocio de arriba como fuente de verdad para " +
    "horarios, dirección, zona de envío y medios de pago. Si te preguntan algo " +
    "que no está ahí ni en el documento de referencia, decilo con honestidad y " +
    "ofrecé derivar a una persona del local.\n" +
    "- No inventes platos, precios ni promociones que no figuren en tu " +
    "información. Si no tenés el dato, pedile un momento al cliente y aclarale " +
    "que un integrante del equipo va a confirmar.\n" +
    "- Para tomar una reserva, pedí siempre fecha, horario y cantidad de " +
    "personas antes de confirmar nada; si el horario pedido está fuera del " +
    "horario de atención, avisá y ofrecé alternativas dentro del horario.\n" +
    "- Para un pedido de delivery, confirmá la dirección de entrega y si está " +
    "dentro de la zona de envío antes de dar un tiempo estimado.\n" +
    "- No brindás asesoramiento sobre alergias o intolerancias más allá de lo " +
    "que diga el documento de referencia; si preguntan por un alérgeno " +
    "específico y no está detallado, recomendá confirmar con el personal del " +
    "local antes de consumir.",
  welcomeMessageTemplate:
    "¡Hola! 👋 Bienvenido/a a {businessName}. Puedo ayudarte con el menú, " +
    "reservas, envíos a domicilio, horarios y medios de pago. ¿En qué te " +
    "ayudo hoy?",
  businessInfoTemplate: {
    horario_atencion:
      "[Completá tu horario de atención, por ejemplo: martes a domingo de " +
      "12:00 a 15:30 y 20:00 a 00:00, aclarando qué día permanecés cerrado]",
    direccion:
      "[Completá la dirección completa del local: calle, altura y una " +
      "referencia cercana, como una esquina o un punto conocido del barrio]",
    telefono_contacto:
      "[Completá el teléfono de contacto del local, con código de área, el " +
      "mismo que usás en tu perfil de WhatsApp Business]",
    zona_de_envio:
      "[Completá la zona de envío que cubrís, por ejemplo los barrios " +
      "cercanos o el radio en kilómetros al que llega tu delivery]",
    tiempo_estimado_delivery:
      "[Completá el tiempo estimado de entrega del delivery, por ejemplo un " +
      "rango en minutos según la zona]",
    metodos_de_pago:
      "[Completá los medios de pago que aceptás, por ejemplo efectivo, " +
      "tarjeta de débito o crédito, transferencia o billeteras virtuales]",
    politica_de_reservas:
      "[Completá tu política de reservas: con cuánta anticipación mínima se " +
      "puede reservar, el tamaño máximo de mesa que tomás por WhatsApp y " +
      "cómo se coordinan los grupos más grandes]",
    especialidad_de_la_casa:
      "[Completá la especialidad de la casa o lo que más se pide, por " +
      "ejemplo el tipo de cocina o un plato insignia]",
  },
  knowledgeDocTemplate:
    "Preguntas frecuentes de {businessName}\n\n" +
    "## Horarios\n" +
    "[Completá tus días y horarios de atención, por ejemplo: martes a " +
    "domingo, mediodía de 12:00 a 15:30 y noche de 20:00 a 00:00, aclarando " +
    "si la cocina cierra antes que el salón y qué día permanecés cerrado.]\n\n" +
    "## Reservas\n" +
    "Tomamos reservas por WhatsApp. [Completá con cuánta anticipación mínima " +
    "se puede reservar, el tamaño máximo de mesa que tomás por este canal y " +
    "cómo se coordinan los grupos más grandes o los eventos privados, por " +
    "ejemplo por teléfono.] Si la reserva es para una fecha con alta demanda " +
    "(fines de semana, feriados), recomendamos confirmar con anticipación. " +
    "[Completá tu política de cancelación: con cuánto tiempo de aviso se " +
    "libera la mesa para otro cliente.]\n\n" +
    "## Delivery y envíos a domicilio\n" +
    "[Completá tu zona de envío y el tiempo estimado de entrega, por ejemplo " +
    "el radio en kilómetros y un rango en minutos según la zona, incluyendo " +
    "si se extiende en horarios pico o con lluvia.] Para pedir delivery " +
    "necesitamos: dirección completa con referencia, forma de pago y el " +
    "detalle del pedido. Si la dirección está fuera de la zona de envío, lo " +
    "avisamos antes de confirmar y ofrecemos la opción de retiro en el local.\n\n" +
    "## Menú\n" +
    "[Completá la especialidad de la casa o el tipo de cocina, por ejemplo " +
    "parrilla, pastas caseras o cocina de autor.] Nuestra carta incluye " +
    "entradas, platos principales, postres y una carta de bebidas con " +
    "opciones sin alcohol. El menú puede variar según temporada y " +
    "disponibilidad de productos frescos; ante cualquier duda puntual sobre " +
    "un plato o precio actual, lo confirmamos con el equipo de cocina antes " +
    "de responder. [Completá si contás con opciones vegetarianas, veganas o " +
    "sin TACC.] Para consultas sobre alérgenos específicos recomendamos " +
    "confirmar directamente con el personal del salón antes de pedir, ya que " +
    "la información de cada plato puede cambiar.\n\n" +
    "## Medios de pago\n" +
    "[Completá los medios de pago que aceptás, por ejemplo efectivo, " +
    "tarjetas de débito y crédito, transferencia bancaria o billeteras " +
    "virtuales.] En pedidos de delivery, el pago se coordina al confirmar el " +
    "pedido: podés ofrecer pago anticipado por transferencia o billetera " +
    "virtual, o pago al recibir el pedido en la puerta.\n\n" +
    "## Otros datos útiles\n" +
    "[Completá otros datos que suelen preguntar tus clientes, por ejemplo si " +
    "hay estacionamiento, acceso para sillas de ruedas, o si coordinás " +
    "eventos privados o menús grupales especiales y con cuánta anticipación.]",
  defaultReplyWindowMs: 5_000,
};

export default restaurante;
