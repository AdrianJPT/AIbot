import type { NicheTemplate } from "@/lib/niche-templates/types";

const panaderia: NicheTemplate = {
  id: "panaderia",
  label: "Panadería",
  systemPromptTemplate:
    "Sos el asistente virtual de {businessName}, una panadería. Atendés por " +
    "WhatsApp a clientes que preguntan por productos del día, pedidos por " +
    "encargo (tortas, facturas para eventos), horarios y medios de pago.\n\n" +
    "Tu tono es cercano y servicial, como quien atiende el mostrador de una " +
    "panadería de barrio. Respondé siempre en español, con mensajes breves " +
    "y claros, pensados para leerse cómodo en WhatsApp.\n\n" +
    "Información del negocio:\n{businessInfo}\n\n" +
    "Reglas de tu rol:\n" +
    "- Usá la información de arriba como fuente de verdad para horarios, " +
    "dirección y medios de pago. Si te preguntan algo que no está ahí ni en " +
    "el documento de referencia, decilo con honestidad y ofrecé derivar a " +
    "una persona del local.\n" +
    "- No inventes productos, precios ni disponibilidad que no figuren en " +
    "tu información.\n" +
    "- Para un pedido por encargo (torta, cantidad grande de facturas), " +
    "pedí siempre fecha de retiro y detalle del pedido antes de confirmar " +
    "cualquier plazo.",
  welcomeMessageTemplate:
    "¡Hola! 👋 Bienvenido/a a {businessName}. Puedo ayudarte con nuestros " +
    "productos, pedidos por encargo, horarios y medios de pago. ¿En qué te " +
    "ayudo hoy?",
  businessInfoTemplate: {
    horario_atencion:
      "[Completá tu horario de atención, por ejemplo: lunes a sábado de " +
      "7:00 a 20:00, aclarando si cerrás algún día]",
    direccion:
      "[Completá la dirección completa del local: calle, altura y una " +
      "referencia cercana]",
    telefono_contacto:
      "[Completá el teléfono de contacto del local, con código de área, el " +
      "mismo que usás en tu perfil de WhatsApp Business]",
    metodos_de_pago:
      "[Completá los medios de pago que aceptás, por ejemplo efectivo, " +
      "tarjeta o billeteras virtuales]",
    pedidos_por_encargo:
      "[Completá con cuánta anticipación mínima se puede encargar una " +
      "torta o un pedido grande, y qué datos pedís para confirmarlo]",
    zona_de_envio:
      "[Completá la zona de envío que cubrís, por ejemplo los barrios " +
      "cercanos o el radio al que llega tu reparto, si ofrecés este " +
      "servicio]",
    opciones_dieteticas:
      "[Completá si tenés opciones sin TACC, integrales, sin azúcar o " +
      "veganas, y si se preparan en un espacio separado del resto]",
  },
  knowledgeDocTemplate:
    "Preguntas frecuentes de {businessName}\n\n" +
    "## Horarios\n" +
    "[Completá tus días y horarios de atención, aclarando si tenés un " +
    "horario de salida del pan caliente.]\n\n" +
    "## Productos\n" +
    "[Completá tus productos destacados, por ejemplo tipos de pan, " +
    "facturas o productos sin TACC.] [Completá si tenés opciones " +
    "integrales, sin azúcar o veganas.]\n\n" +
    "## Pedidos por encargo\n" +
    "[Completá con cuánta anticipación se pueden encargar tortas o pedidos " +
    "grandes para eventos.] Para un encargo necesitamos el detalle del " +
    "pedido, la fecha de retiro y una forma de contacto.\n\n" +
    "## Envíos\n" +
    "[Completá si hacés envíos a domicilio, la zona que cubrís y si hay un " +
    "pedido mínimo para el reparto.]\n\n" +
    "## Medios de pago\n" +
    "[Completá los medios de pago que aceptás.]\n\n" +
    "## Otros datos útiles\n" +
    "[Completá otros datos que suelen preguntar tus clientes, por ejemplo " +
    "si tomás pedidos para desayunos o meriendas de oficina, o si vendés " +
    "por peso o por unidad.]",
  defaultReplyWindowMs: 5_000,
};

export default panaderia;
