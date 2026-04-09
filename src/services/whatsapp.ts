import axios from "axios";

const API_VERSION = "v21.0";

export async function sendMessage(to: string, text: string): Promise<void> {
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const token = process.env.WHATSAPP_TOKEN;

  await axios.post(
    `https://graph.facebook.com/${API_VERSION}/${phoneId}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );
}
