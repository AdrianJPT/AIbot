import type { NicheTemplate } from "@/lib/niche-templates/types";

const tienda: NicheTemplate = {
  id: "tienda",
  label: "Tienda",
  systemPromptTemplate:
    "Sos el asistente virtual de {businessName}, una tienda. Atendés por " +
    "WhatsApp a personas que preguntan por productos, stock, horarios y " +
    "medios de pago.\n\n" +
    "Tu tono es amable y resolutivo. Respondé siempre en español, con " +
    "mensajes breves y claros, pensados para leerse cómodo en WhatsApp.\n\n" +
    "Información del negocio:\n{businessInfo}\n\n" +
    "Reglas de tu rol:\n" +
    "- Usá la información de arriba como fuente de verdad para horarios, " +
    "dirección, envíos y medios de pago. Si te preguntan algo que no está " +
    "ahí ni en el documento de referencia, decilo con honestidad y ofrecé " +
    "derivar a una persona de la tienda.\n" +
    "- No inventes productos, precios ni stock disponible que no figuren " +
    "en tu información.\n" +
    "- Para confirmar una compra o reserva de un producto, pedí siempre el " +
    "producto de interés y si retira en el local o pide envío, antes de " +
    "confirmar nada.",
  welcomeMessageTemplate:
    "¡Hola! 👋 Bienvenido/a a {businessName}. Puedo ayudarte con " +
    "productos, stock, horarios y medios de pago. ¿En qué te ayudo hoy?",
  businessInfoTemplate: {
    horario_atencion:
      "[Completá tu horario de atención, por ejemplo: lunes a sábado de " +
      "9:00 a 20:00, aclarando qué día permanecés cerrado]",
    direccion:
      "[Completá la dirección completa de la tienda: calle, altura y una " +
      "referencia cercana]",
    telefono_contacto:
      "[Completá el teléfono de contacto de la tienda, con código de " +
      "área, el mismo que usás en tu perfil de WhatsApp Business]",
    metodos_de_pago:
      "[Completá los medios de pago que aceptás, por ejemplo efectivo, " +
      "tarjeta o billeteras virtuales]",
    productos_que_vendes:
      "[Completá los productos o rubros que vendés, por ejemplo " +
      "indumentaria, electrónica o artículos del hogar]",
    politica_de_envios_y_cambios:
      "[Completá si hacés envíos, sus zonas, y tu política de cambios y " +
      "devoluciones]",
    tiempo_estimado_de_entrega:
      "[Completá el tiempo estimado de entrega de un envío, por ejemplo un " +
      "rango en días según la zona]",
    reserva_o_apartado_de_productos:
      "[Completá si podés reservar o apartar un producto para retirar " +
      "después, y por cuánto tiempo se mantiene la reserva]",
  },
  knowledgeDocTemplate:
    "Preguntas frecuentes de {businessName}\n\n" +
    "## Horarios\n" +
    "[Completá tus días y horarios de atención.]\n\n" +
    "## Productos\n" +
    "[Completá los productos o rubros que vendés y cómo consultar stock " +
    "disponible.]\n\n" +
    "## Envíos y retiro\n" +
    "[Completá si hacés envíos, sus zonas, y el tiempo estimado de " +
    "entrega.] Si hay retiro en el local, indicá qué se necesita para " +
    "retirar un pedido.\n\n" +
    "## Reservas de productos\n" +
    "[Completá si podés reservar o apartar un producto para un cliente y " +
    "por cuánto tiempo se mantiene la reserva antes de liberarlo.]\n\n" +
    "## Medios de pago y cambios\n" +
    "[Completá los medios de pago que aceptás y tu política de cambios y " +
    "devoluciones.]",
  defaultReplyWindowMs: 5_000,
};

export default tienda;
