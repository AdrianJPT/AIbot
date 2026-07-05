export type AppointmentListItem = {
  id: string;
  business: { name: string };
  customerName: string;
  customerPhone: string;
  service: string;
  date: string;
  time: string;
  status: string;
};

export type BusinessOption = {
  id: string;
  name: string;
};

export type AppointmentInput = {
  businessId: string;
  customerPhone: string;
  customerName: string;
  service: string;
  date: string;
  time: string;
  notes: string | null;
};
