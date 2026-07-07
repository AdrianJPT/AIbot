export type BusinessListItem = {
  id: string;
  name: string;
  phoneNumberId: string | null;
  displayPhone: string | null;
  isActive: boolean;
  conversationsCount: number;
  unreadCount: number;
  lastActivityAt: Date | null;
};

export type CredentialOption = {
  id: string;
  kind: string;
  label: string;
  provider: string;
};

export type BusinessDetail = {
  id: string;
  name: string;
  phoneNumberId: string | null;
  displayPhone?: string | null;
  // The server never returns the raw token — it's write-only (wrapped into
  // an encrypted Credential on save, see docs/plan/07-waba-phone-numbers.md).
  whatsappToken?: string;
  systemPrompt: string;
  welcomeMessage: string;
  businessInfo: unknown;
  model: string | null;
  visionModel: string | null;
  audioModel: string | null;
  maxHistoryMessages: number;
  isActive: boolean;
  aiCredentialId?: string | null;
  whatsappCredentialId?: string | null;
};

export type PhoneNumberItem = {
  id: string;
  phoneNumberId: string;
  displayPhone: string | null;
  isActive: boolean;
};

export type PhoneNumberInput = {
  phoneNumberId: string;
  displayPhone: string | null;
  whatsappToken?: string;
  whatsappCredentialId?: string | null;
  isActive?: boolean;
};

export type BusinessInput = {
  name: string;
  phoneNumberId: string | null;
  displayPhone: string | null;
  whatsappToken: string;
  systemPrompt: string;
  welcomeMessage: string;
  businessInfo: unknown;
  model: string;
  visionModel: string;
  audioModel: string;
  maxHistoryMessages: number;
  isActive: boolean;
  aiCredentialId: string | null;
  whatsappCredentialId: string | null;
  ownerId?: string;
};
