import "dotenv/config";
import express, { Request, Response } from "express";
import { loadConfig } from "./config/business-config";
import { sendMessage } from "./services/whatsapp";
import { generateResponse } from "./services/openai";
import { getHistory, addMessage } from "./store/conversation";

const app = express();
app.use(express.json());

const config = loadConfig();

// Webhook verification (Meta sends a GET to validate)
app.get("/webhook", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log("Webhook verified");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Receive incoming messages
app.post("/webhook", async (req: Request, res: Response) => {
  // Always respond 200 quickly so Meta doesn't retry
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const message = change?.messages?.[0];

    if (!message || message.type !== "text") return;

    const from: string = message.from;
    const text: string = message.text.body;

    console.log(`[${from}]: ${text}`);

    const history = getHistory(from, config.maxHistoryMessages);

    const reply = await generateResponse(
      config.systemPrompt,
      history,
      text,
      config.model
    );

    addMessage(from, "user", text);
    addMessage(from, "assistant", reply);

    await sendMessage(from, reply);
    console.log(`[BOT -> ${from}]: ${reply}`);
  } catch (err) {
    console.error("Error processing message:", err);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bot running on port ${PORT}`);
  console.log(`Business: ${config.businessName}`);
});
