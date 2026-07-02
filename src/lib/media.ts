import axios from "axios";
import { toFile } from "openai/uploads";
import { DEFAULT_MODEL, DEFAULT_PROVIDER, supportsVision } from "./model-catalog";
import { getProviderClient } from "./providers";

const API_VERSION = "v21.0";

async function getMediaUrl(
  mediaId: string,
  token: string
): Promise<{ url: string; mime_type?: string }> {
  const { data } = await axios.get(
    `https://graph.facebook.com/${API_VERSION}/${mediaId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data;
}

export async function downloadMediaBuffer(
  mediaId: string,
  token: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  const meta = await getMediaUrl(mediaId, token);
  const res = await axios.get(meta.url, {
    headers: { Authorization: `Bearer ${token}` },
    responseType: "arraybuffer",
  });
  const mimeType = meta.mime_type || "application/octet-stream";
  return { buffer: Buffer.from(res.data), mimeType };
}

export async function describeImageFromBuffer(
  buffer: Buffer,
  mimeType: string,
  provider: string,
  model: string
): Promise<string> {
  // Fall back to the default OpenAI vision model when the business's
  // configured model cannot read images.
  const useConfigured = supportsVision(provider, model);
  const visionProvider = useConfigured ? provider : DEFAULT_PROVIDER;
  const visionModel = useConfigured ? model : DEFAULT_MODEL;

  const base64 = buffer.toString("base64");
  const dataUrl = `data:${mimeType};base64,${base64}`;
  const response = await getProviderClient(visionProvider).chat.completions.create({
    model: visionModel,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Describe brevemente la imagen en español (1-3 oraciones). Si es un comprobante o menú, resume lo relevante.",
          },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
    max_tokens: 300,
  });
  return (
    response.choices[0]?.message?.content?.trim() ||
    "[Imagen sin descripción]"
  );
}

export async function transcribeAudioBuffer(buffer: Buffer): Promise<string> {
  const file = await toFile(buffer, "audio.ogg", { type: "audio/ogg" });
  // Audio transcription is only available on OpenAI (Whisper), regardless
  // of the provider configured for chat.
  const response = await getProviderClient("openai").audio.transcriptions.create({
    file,
    model: "whisper-1",
  });
  return response.text?.trim() || "[Audio sin transcripción]";
}
