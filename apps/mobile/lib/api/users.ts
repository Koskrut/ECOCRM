import { apiFetch } from "@/lib/api";

export type TeamUser = {
  id: string;
  fullName: string;
  email: string;
  role: string;
};

type UsersResponse = TeamUser[] | { items?: TeamUser[] };

function normalizeUsers(res: UsersResponse): TeamUser[] {
  return Array.isArray(res) ? res : (res.items ?? []);
}

export const usersApi = {
  list: (token: string) =>
    apiFetch<UsersResponse>("/users", { token }).then(normalizeUsers),
};
