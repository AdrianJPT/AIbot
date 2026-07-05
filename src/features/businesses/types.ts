export type BusinessListItem = {
  id: string;
  name: string;
  phoneNumberId: string;
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
  status: string;
};

export type BusinessDetail = {
  id: string;
  name: string;
  phoneNumberId: string;
  whatsappToken: string;
  systemPrompt: string;
  welcomeMessage: string;
  businessInfo: unknown;
  model: string;
  maxHistoryMessages: number;
  isActive: boolean;
  aiCredentialId?: string | null;
  whatsappCredentialId?: string | null;
};

export type BusinessInput = {
  name: string;
  phoneNumberId: string;
  whatsappToken: string;
  systemPrompt: string;
  welcomeMessage: string;
  businessInfo: unknown;
  model: string;
  maxHistoryMessages: number;
  isActive: boolean;
  aiCredentialId: string | null;
  whatsappCredentialId: string | null;
};
