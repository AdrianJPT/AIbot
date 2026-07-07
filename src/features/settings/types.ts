export type AiDefaults = {
  whatsappCredentialId: string | null;
  chatModel: string;
  visionModel: string;
  audioModel: string;
};

export type AiCredentialOption = {
  id: string;
  label: string;
  provider: string;
};
