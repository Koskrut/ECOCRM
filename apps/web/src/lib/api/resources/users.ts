import { apiHttp } from "../client";

export type UserRole = "ADMIN" | "LEAD" | "MANAGER" | "WAREHOUSE" | "USER";

export type UserEmployeeFieldProfile = {
  fuelLitersPer100km?: number;
  fuelPricePerLiter?: string | number | null;
  vehicleLabel?: string | null;
  usePersonalCar?: boolean;
};

export type User = {
  id: string;
  email: string;
  username?: string | null;
  fullName?: string | null;
  role: UserRole;
  isActive?: boolean;
  createdAt?: string;
  routeStartLat?: number | null;
  routeStartLng?: number | null;
  routeEndLat?: number | null;
  routeEndLng?: number | null;
  routeStartLabel?: string | null;
  routeEndLabel?: string | null;
  leadId?: string | null;
  fieldProfile?: UserEmployeeFieldProfile | null;
};

export type CreateUserPayload = {
  email: string;
  fullName?: string | null;
  username?: string;
  password: string;
  role: UserRole;
  isActive?: boolean;
};

export type UpdateUserPayload = {
  email?: string;
  fullName?: string | null;
  username?: string | null;
  password?: string;
  isActive?: boolean;
  routeStartLat?: number | null;
  routeStartLng?: number | null;
  routeEndLat?: number | null;
  routeEndLng?: number | null;
  routeStartLabel?: string | null;
  routeEndLabel?: string | null;
  leadId?: string | null;
  fuelLitersPer100km?: number;
  fuelPricePerLiter?: number | null;
  vehicleLabel?: string | null;
  usePersonalCar?: boolean;
};

export const usersApi = {
  list: async (): Promise<User[]> => {
    const res = await apiHttp.get<{ items?: User[] } | User[]>("/users");
    const data = res.data;
    return Array.isArray(data) ? data : (data?.items ?? []);
  },

  get: async (id: string): Promise<User> => {
    const res = await apiHttp.get<{ user: User }>(`/users/${id}`);
    return res.data.user;
  },

  create: async (payload: CreateUserPayload): Promise<User> => {
    const res = await apiHttp.post<{ user: User }>("/users", payload);
    return res.data.user;
  },

  update: async (id: string, payload: UpdateUserPayload): Promise<User> => {
    const res = await apiHttp.patch<{ user: User }>(`/users/${id}`, payload);
    return res.data.user;
  },

  updateRole: async (id: string, role: UserRole): Promise<User> => {
    const res = await apiHttp.patch<{ user: User }>(`/users/${id}/role`, { role });
    return res.data.user;
  },

  remove: async (id: string): Promise<void> => {
    await apiHttp.delete(`/users/${id}`);
  },
};
