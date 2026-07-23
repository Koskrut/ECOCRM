import { UserRole } from "@prisma/client";

export const PermissionKeys = {
  MetadataRead: "metadata.read",
  MetadataWrite: "metadata.write",
  DictionariesManage: "dictionaries.manage",
  CustomFieldsManage: "custom_fields.manage",
  LayoutsManage: "layouts.manage",
  WorkflowsManage: "workflows.manage",
  UsersManage: "users.manage",
  FinanceRead: "finance.read",
  FinanceWrite: "finance.write",
  OutboundManage: "outbound.manage",
  SystemManage: "system.manage",
  HelpRead: "help.read",
  HelpWrite: "help.write",
  RiskRead: "risk.read",
  RiskManage: "risk.manage",
  RiskCreditManage: "risk.credit.manage",
} as const;

export type PermissionKey = (typeof PermissionKeys)[keyof typeof PermissionKeys] | (string & {});

export const DEFAULT_RBAC_PERMISSIONS = [
  { key: PermissionKeys.MetadataRead, name: "Read metadata", category: "metadata" },
  { key: PermissionKeys.MetadataWrite, name: "Write metadata", category: "metadata" },
  { key: PermissionKeys.DictionariesManage, name: "Manage dictionaries", category: "metadata" },
  { key: PermissionKeys.CustomFieldsManage, name: "Manage custom fields", category: "metadata" },
  { key: PermissionKeys.LayoutsManage, name: "Manage layouts", category: "metadata" },
  { key: PermissionKeys.WorkflowsManage, name: "Manage workflows", category: "automation" },
  { key: PermissionKeys.UsersManage, name: "Manage users", category: "admin" },
  { key: PermissionKeys.FinanceRead, name: "Read finance", category: "finance" },
  { key: PermissionKeys.FinanceWrite, name: "Write finance", category: "finance" },
  { key: PermissionKeys.OutboundManage, name: "Manage outbound calling", category: "outbound" },
  { key: PermissionKeys.SystemManage, name: "Manage system settings", category: "admin" },
  { key: PermissionKeys.HelpRead, name: "Read help articles", category: "help" },
  { key: PermissionKeys.HelpWrite, name: "Write help articles", category: "help" },
  { key: PermissionKeys.RiskRead, name: "Read risk management", category: "risk" },
  { key: PermissionKeys.RiskManage, name: "Manage risk engine", category: "risk" },
  { key: PermissionKeys.RiskCreditManage, name: "Manage credit limits and approvals", category: "risk" },
] as const;

export const DEFAULT_LEGACY_ROLE_PERMISSIONS: Record<UserRole, PermissionKey[]> = {
  [UserRole.ADMIN]: DEFAULT_RBAC_PERMISSIONS.map((permission) => permission.key),
  [UserRole.LEAD]: [
    PermissionKeys.MetadataRead,
    PermissionKeys.MetadataWrite,
    PermissionKeys.FinanceRead,
    PermissionKeys.HelpRead,
    PermissionKeys.HelpWrite,
    PermissionKeys.RiskRead,
    PermissionKeys.RiskManage,
    PermissionKeys.RiskCreditManage,
  ],
  [UserRole.MANAGER]: [PermissionKeys.MetadataRead, PermissionKeys.MetadataWrite, PermissionKeys.HelpRead, PermissionKeys.RiskRead],
  [UserRole.WAREHOUSE]: [PermissionKeys.MetadataRead, PermissionKeys.HelpRead],
  [UserRole.USER]: [PermissionKeys.MetadataRead, PermissionKeys.HelpRead],
};

export const LEGACY_RBAC_ROLE_KEYS: Record<UserRole, string> = {
  [UserRole.ADMIN]: "legacy.admin",
  [UserRole.LEAD]: "legacy.lead",
  [UserRole.MANAGER]: "legacy.manager",
  [UserRole.WAREHOUSE]: "legacy.warehouse",
  [UserRole.USER]: "legacy.user",
};
