export type Credential = {
  id: string;
  kind: string;
  provider: string;
  label: string;
  keyLast4: string;
  baseUrl: string | null;
  lastUsedAt: string | Date | null;
  lastError: string | null;
  createdAt: string | Date;
};

export type NewCredentialInput = {
  kind: "ai" | "whatsapp";
  provider: string;
  label: string;
  key: string;
  baseUrl?: string;
};

export type UpdateCredentialInput = {
  label?: string;
  baseUrl?: string;
  key?: string;
};
