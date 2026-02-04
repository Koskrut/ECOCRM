export type Contact = {
  id: string;
  companyId?: string;
  company?: {
    id: string;
    name: string;
  };
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  position?: string;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
  recipients?: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    city: string;
    warehouse: string;
    createdAt: string;
    updatedAt: string;
  }[];
};
