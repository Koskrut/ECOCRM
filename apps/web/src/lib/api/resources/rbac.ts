import { apiHttp } from "../client";

export type RbacPermission = {
  id: string;
  key: string;
  name: string;
};

export type RbacRole = {
  id: string;
  key: string;
  name: string;
  system?: boolean;
};

export type RbacAssignment = {
  role: RbacRole;
};

export type RbacEffective = {
  userId: string;
  legacyRole: string;
  permissions: string[];
};

export const rbacApi = {
  listCatalog: async (): Promise<{ roles: RbacRole[]; permissions: RbacPermission[] }> => {
    const res = await apiHttp.get<{ roles: RbacRole[]; permissions: RbacPermission[] }>("/rbac");
    return {
      roles: res.data?.roles ?? [],
      permissions: res.data?.permissions ?? [],
    };
  },

  listAssignments: async (userId: string): Promise<RbacAssignment[]> => {
    const res = await apiHttp.get<{ items: RbacAssignment[] }>(`/rbac/users/${userId}/assignments`);
    return res.data?.items ?? [];
  },

  effective: async (userId: string): Promise<RbacEffective> => {
    const res = await apiHttp.get<RbacEffective>(`/rbac/users/${userId}/effective`);
    return res.data;
  },

  assignRole: async (userId: string, roleId: string): Promise<void> => {
    await apiHttp.post(`/rbac/users/${userId}/roles`, { roleId });
  },

  removeRole: async (userId: string, roleId: string): Promise<void> => {
    await apiHttp.delete(`/rbac/users/${userId}/roles/${roleId}`);
  },
};
