import type { NicheTemplate } from "@/lib/niche-templates/types";

const cafeteria: NicheTemplate = {
  id: "cafeteria",
  label: "Cafetería",
  systemPromptTemplate:
    "Sos el asistente virtual de {businessName}, una cafetería. Atendés por " +
    "WhatsApp a clientes que preguntan por la carta de café y pastelería, " +
    "horarios, pedidos para llevar, delivery y medios de pago.\n\n" +
    "Tu tono es cálido y relajado, como quien atiende la barra de una " +
    "cafetería de barrio. Respondé siempre en español, con mensajes breves y " +
    "claros, pensados para leerse cómodo en WhatsApp.\n\n" +
    "Información del negocio:\n{businessInfo}\n\n" +
    "Reglas de tu rol:\n" +
    "- Usá la información de arriba como fuente de verdad para horarios, " +
    "dirección y medios de pago. Si te preguntan algo que no está ahí ni en " +
    "el documento de referencia, decilo con honestidad y ofrecé derivar a " +
    "una persona del local.\n" +
    "- No inventes productos, precios ni promociones que no figuren en tu " +
    "información.\n" +
    "- Para un pedido para llevar o delivery, confirmá qué productos quiere " +
    "el cliente y la forma de entrega antes de dar un tiempo estimado.",
  welcomeMessageTemplate:
    "¡Hola! 👋 Bienvenido/a a {businessName}. Puedo ayudarte con la carta, " +
    "pedidos para llevar, delivery, horarios y medios de pago. ¿En qué te " +
    "ayudo hoy?",
  businessInfoTemplate: {
    horario_atencion:
      "[Completá tu horario de atención, por ejemplo: lunes a sábado de " +
      "8:00 a 20:00, aclarando si cerrás algún día]",
    direccion:
      "[Completá la dirección completa del local: calle, altura y una " +
      "referencia cercana]",
    telefono_contacto:
      "[Completá el teléfono de contacto del local, con código de área, el " +
      "mismo que usás en tu perfil de WhatsApp Business]",
    metodos_de_pago:
      "[Completá los medios de pago que aceptás, por ejemplo efectivo, " +
      "tarjeta o billeteras virtuales]",
    especialidad_de_la_casa:
      "[Completá tu especialidad, por ejemplo el tipo de café que servís o " +
      "un producto de pastelería insignia]",
    zona_de_envio:
      "[Completá la zona de envío que cubrís, por ejemplo los barrios " +
      "cercanos o el radio al que llega tu delivery, si ofrecés este " +
      "servicio]",
    tiempo_estimado_delivery:
      "[Completá el tiempo estimado de entrega del delivery, por ejemplo " +
      "un rango en minutos según la zona]",
    wifi_y_espacio_para_trabajar:
      "[Completá si contás con wifi para clientes y si el espacio es apto " +
      "para trabajar o estudiar, por ejemplo con enchufes disponibles o un " +
      "límite de tiempo en horarios pico]",
  },
  knowledgeDocTemplate:
    "Preguntas frecuentes de {businessName}\n\n" +
    "## Horarios\n" +
    "[Completá tus días y horarios de atención.]\n\n" +
    "## Carta\n" +
    "[Completá tu especialidad de café y las opciones de pastelería que " +
    "ofrecés.] La carta puede variar según disponibilidad de productos " +
    "frescos.\n\n" +
    "## Pedidos para llevar y delivery\n" +
    "[Completá tu zona de envío y el tiempo estimado de entrega, por " +
    "ejemplo el radio y un rango en minutos según la zona.] Para un pedido " +
    "necesitamos el detalle de los productos y la forma de entrega " +
    "elegida. Si la dirección está fuera de la zona de envío, lo avisamos " +
    "antes de confirmar y ofrecemos la opción de retiro en el local.\n\n" +
    "## Wifi y espacio para trabajar\n" +
    "[Completá si contás con wifi para clientes, si el espacio es apto " +
    "para trabajar o estudiar y si hay algún límite de tiempo en horarios " +
    "pico.]\n\n" +
    "## Medios de pago\n" +
    "[Completá los medios de pago que aceptás.]\n\n" +
    "## Otros datos útiles\n" +
    "[Completá otros datos que suelen preguntar tus clientes, por ejemplo " +
    "si aceptás mascotas, si tenés opciones vegetarianas, veganas o sin " +
    "TACC, o si armás mesas dulces o catering para eventos.]",
  defaultReplyWindowMs: 5_000,
};

export default cafeteria;
