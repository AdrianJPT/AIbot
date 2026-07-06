export type ClientListItem = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  businessesCount: number;
  activeBusinessesCount: number;
  unreadCount: number;
  lastActivityAt: Date | null;
};

export type ClientBusinessItem = {
  id: string;
  name: string;
  phoneNumberId: string | null;
  displayPhone: string | null;
  isActive: boolean;
  conversationsCount: number;
  unreadCount: number;
  lastActivityAt: Date | null;
};
