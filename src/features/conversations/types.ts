export type ConversationListItem = {
  id: string;
  customerPhone: string;
  status: string;
  updatedAt: string | Date;
  business: { name: string };
};

export type ConversationMessage = {
  id: string;
  role: string;
  content: string;
  mediaType: string;
  createdAt: string;
};

export type ConversationDetail = {
  id: string;
  customerPhone: string;
  status: string;
  business: { name: string };
  messages: ConversationMessage[];
};
