/**
 * Realistic WhatsApp Cloud API webhook payload fixtures.
 * Shapes based on the `value.messages[]` entries parsed in `src/lib/message-handler.ts`.
 */

export const TEST_PHONE_NUMBER_ID = "123456789012345";
export const TEST_CUSTOMER_PHONE = "5215512345678";
export const TEST_DISPLAY_PHONE_NUMBER = "15550001111";

type WaMessage = Record<string, unknown>;

function buildPayload(messages: WaMessage[]) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WHATSAPP_BUSINESS_ACCOUNT_ID",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: TEST_DISPLAY_PHONE_NUMBER,
                phone_number_id: TEST_PHONE_NUMBER_ID,
              },
              contacts: [
                {
                  profile: { name: "Cliente de Prueba" },
                  wa_id: TEST_CUSTOMER_PHONE,
                },
              ],
              messages,
            },
            field: "messages",
          },
        ],
      },
    ],
  };
}

export const textMessagePayload = buildPayload([
  {
    from: TEST_CUSTOMER_PHONE,
    id: "wamid.TEXT_MESSAGE_ID_001",
    timestamp: "1735776000",
    type: "text",
    text: { body: "Hola, quiero hacer una reserva" },
  },
]);

export const imageMessagePayload = buildPayload([
  {
    from: TEST_CUSTOMER_PHONE,
    id: "wamid.IMAGE_MESSAGE_ID_002",
    timestamp: "1735776001",
    type: "image",
    image: {
      id: "MEDIA_ID_IMAGE_001",
      mime_type: "image/jpeg",
      sha256: "abc123",
    },
  },
]);

export const audioMessagePayload = buildPayload([
  {
    from: TEST_CUSTOMER_PHONE,
    id: "wamid.AUDIO_MESSAGE_ID_003",
    timestamp: "1735776002",
    type: "audio",
    audio: {
      id: "MEDIA_ID_AUDIO_001",
      mime_type: "audio/ogg; codecs=opus",
    },
  },
]);

export const locationMessagePayload = buildPayload([
  {
    from: TEST_CUSTOMER_PHONE,
    id: "wamid.LOCATION_MESSAGE_ID_004",
    timestamp: "1735776003",
    type: "location",
    location: {
      latitude: 19.432608,
      longitude: -99.133209,
      name: "Zócalo",
      address: "Centro Histórico, CDMX",
    },
  },
]);

export const interactiveMessagePayload = buildPayload([
  {
    from: TEST_CUSTOMER_PHONE,
    id: "wamid.INTERACTIVE_MESSAGE_ID_005",
    timestamp: "1735776004",
    type: "interactive",
    interactive: {
      type: "list_reply",
      list_reply: { id: "menu_reservar", title: "Reservar mesa" },
    },
  },
]);

export const documentMessagePayload = buildPayload([
  {
    from: TEST_CUSTOMER_PHONE,
    id: "wamid.DOCUMENT_MESSAGE_ID_006",
    timestamp: "1735776005",
    type: "document",
    document: {
      id: "MEDIA_ID_DOCUMENT_001",
      filename: "comprobante.pdf",
      mime_type: "application/pdf",
    },
  },
]);

// Delivery status updates use `statuses[]` instead of `messages[]` and are
// out of scope for handling in Phase 1 (see docs/plan/01-foundations.md),
// but the fixture is added now so future phases can reuse it.
export const statusUpdatePayload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WHATSAPP_BUSINESS_ACCOUNT_ID",
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: TEST_DISPLAY_PHONE_NUMBER,
              phone_number_id: TEST_PHONE_NUMBER_ID,
            },
            statuses: [
              {
                id: "wamid.TEXT_MESSAGE_ID_001",
                status: "delivered",
                timestamp: "1735776006",
                recipient_id: TEST_CUSTOMER_PHONE,
              },
            ],
          },
          field: "messages",
        },
      ],
    },
  ],
};
