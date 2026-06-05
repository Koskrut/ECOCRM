import { strings } from "@/locales";

const t = strings.employees.modal;

/** Human-readable label for a legacy UserRole code. */
export function formatUserRole(role: string | null | undefined): string {
  if (!role) return "—";
  switch (role.toUpperCase()) {
    case "USER":
      return t.roleUser;
    case "WAREHOUSE":
      return t.roleWarehouse;
    case "LEAD":
      return t.roleLead;
    case "MANAGER":
      return t.roleManager;
    case "ADMIN":
      return t.roleAdmin;
    default:
      return role;
  }
}
