import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const businesses = [
  {
    name: "Restaurante El Buen Sabor",
    phoneNumberId: process.env.SEED_PHONE_NUMBER_ID || "REPLACE_PHONE_NUMBER_ID",
    welcomeMessage:
      "¡Hola! Bienvenido a {businessName} ¿En qué puedo ayudarte?",
    systemPrompt: `Eres el asistente virtual de {businessName}. Ayudas con reservaciones, menú, horarios y ubicación. Responde en español, amable y conciso.

Información del negocio:
{businessInfo}

Reglas:
- Si quieren reservar, pide: nombre, fecha, hora y número de personas.
- Si preguntan por el menú, da opciones generales.
- Cuando el cliente quiera agendar una cita o reserva, recopila: nombre, servicio (o motivo), fecha y hora. Confirma los datos al cliente.
- No inventes información que no tengas.`,
    businessInfo: {
      Horario: "Lunes a Sábado 12:00 - 22:00",
      Dirección: "Av. Principal #123, Col. Centro",
      Teléfono: "+52 555 123 4567",
      Especialidad: "Comida mexicana tradicional",
    },
  },
  {
    name: "Barbería The Classic Cut",
    phoneNumberId: "REPLACE_PHONE_NUMBER_ID_2",
    welcomeMessage: "¡Qué onda! Bienvenido a {businessName} ¿En qué te ayudo?",
    systemPrompt: `Eres el asistente virtual de {businessName}. Citas, servicios y precios. Español, tono casual.

Información del negocio:
{businessInfo}

Reglas:
- Para cita: nombre, servicio, fecha y hora.
- Cuando quieran agendar, recopila nombre, servicio, fecha y hora y confirma.
- No inventes datos.`,
    businessInfo: {
      Horario: "Martes a Domingo 10:00 - 20:00",
      Dirección: "Calle 5 de Mayo #456",
      Teléfono: "+52 555 987 6543",
      Servicios:
        "Corte $150 | Barba $100 | Corte + Barba $220",
    },
  },
  {
    name: "Hotel Vista Mar",
    phoneNumberId: "REPLACE_PHONE_NUMBER_ID_3",
    welcomeMessage: "¡Bienvenido a {businessName}! ¿En qué podemos asistirle?",
    systemPrompt: `Eres el asistente virtual de {businessName}. Reservas, amenidades, check-in/out. Español, profesional.

Información del negocio:
{businessInfo}

Reglas:
- Reserva: nombre, fechas check-in/out, huéspedes, tipo de habitación.
- Para citas de visita o consultas, recopila datos y confirma.
- No inventes precios fuera de la info.`,
    businessInfo: {
      "Horario recepción": "24 horas",
      "Check-in": "15:00",
      "Check-out": "12:00",
      Dirección: "Blvd. Costero #789",
      Teléfono: "+52 555 456 7890",
      Habitaciones: "Estándar $1,200 | Suite $2,500",
      Amenidades: "Alberca, gym, restaurante, WiFi",
    },
  },
  {
    name: "Inmobiliaria Hogar Ideal",
    phoneNumberId: "REPLACE_PHONE_NUMBER_ID_4",
    welcomeMessage:
      "¡Hola! Bienvenido a {businessName} ¿Buscas comprar, rentar o vender?",
    systemPrompt: `Eres el asistente virtual de {businessName}. Propiedades y visitas. Español, profesional.

Información del negocio:
{businessInfo}

Reglas:
- Visita: nombre, propiedad o zona, fecha y hora.
- No inventes propiedades ni precios específicos.`,
    businessInfo: {
      Horario: "Lun-Vie 9-18, Sáb 10-14",
      Dirección: "Av. Reforma #1000",
      Teléfono: "+52 555 321 0987",
      Zonas: "Centro, Norte, Sur, Playa",
      Tipos: "Casas, deptos, terrenos, locales",
    },
  },
];

async function main() {
  const ownerEmail = process.env.SEED_OWNER_EMAIL || "seed-owner@example.com";
  const owner = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: {},
    create: { id: randomUUID(), email: ownerEmail, role: "client" },
  });

  for (const b of businesses) {
    const existing = await prisma.phoneNumber.findUnique({
      where: { phoneNumberId: b.phoneNumberId },
    });

    if (existing) {
      await prisma.business.update({
        where: { id: existing.businessId },
        data: {
          name: b.name,
          systemPrompt: b.systemPrompt,
          welcomeMessage: b.welcomeMessage,
          businessInfo: b.businessInfo,
        },
      });
      continue;
    }

    await prisma.business.create({
      data: {
        name: b.name,
        systemPrompt: b.systemPrompt,
        welcomeMessage: b.welcomeMessage,
        businessInfo: b.businessInfo,
        model: "gpt-4o-mini",
        maxHistoryMessages: 20,
        isActive: true,
        ownerId: owner.id,
        phoneNumbers: { create: { phoneNumberId: b.phoneNumberId } },
      },
    });
  }
  console.log("Seed OK");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
