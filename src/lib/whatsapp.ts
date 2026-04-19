import axios from "axios";

const API_VERSION = "v21.0";

export async function sendMessage(
  phoneNumberId: string,
  token: string,
  to: string,
  text: string
): Promise<void> {
  await axios.post(
    `https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`,
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
