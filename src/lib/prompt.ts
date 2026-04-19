import type { Business } from "@prisma/client";

export function buildSystemPrompt(business: Business): string {
  const info = business.businessInfo as Record<string, string>;
  const infoBlock = Object.entries(info)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
  return business.systemPrompt
    .replace(/{businessName}/g, business.name)
    .replace(/{businessInfo}/g, infoBlock);
}

export function buildWelcomeMessage(business: Business): string {
  return business.welcomeMessage.replace(/{businessName}/g, business.name);
}
