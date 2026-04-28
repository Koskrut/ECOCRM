import type { ModuleId, ModuleManifestV1 } from "@crm/contracts/modules";

export type ModuleCapabilityType =
  | "routes"
  | "navigation"
  | "permissions"
  | "workflowActions"
  | "integrationPorts"
  | "health";

export declare const ModuleCapabilityTypes: {
  readonly Routes: "routes";
  readonly Navigation: "navigation";
  readonly Permissions: "permissions";
  readonly WorkflowActions: "workflowActions";
  readonly IntegrationPorts: "integrationPorts";
  readonly Health: "health";
};

export type ModuleRequiredEnv = {
  name: string;
  description: string;
  required: boolean;
  secret: boolean;
};

export type ModuleMigrationDescriptor = {
  owner: "core" | "module";
  path: string;
  required: boolean;
};

export type ModuleRouteDescriptor = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  description: string;
  requiredPermissions?: string[];
};

export type ModuleNavigationItem = {
  id: string;
  label: string;
  path: string;
  requiredPermissions?: string[];
  requiredModules?: ModuleId[];
};

export type ModulePermissionDescriptor = {
  key: string;
  label: string;
  description: string;
  category?: string;
};

export type ModuleWorkflowActionDescriptor = {
  type: string;
  label: string;
  description: string;
  safe: true;
  requiredPermissions?: string[];
};

export type ModuleIntegrationPortDescriptor = {
  name: string;
  description: string;
  direction: "provides" | "consumes";
};

export type ModuleHealthDescriptor = {
  endpoint?: string;
  checks: string[];
};

export type ModuleRegistrationV1 = ModuleManifestV1 & {
  requiredEnv?: ModuleRequiredEnv[];
  migrations?: ModuleMigrationDescriptor[];
  routes?: ModuleRouteDescriptor[];
  navigation?: ModuleNavigationItem[];
  permissions?: ModulePermissionDescriptor[];
  workflowActions?: ModuleWorkflowActionDescriptor[];
  integrationPorts?: ModuleIntegrationPortDescriptor[];
  health?: ModuleHealthDescriptor;
};

export declare function assertModuleManifestV1<T extends ModuleRegistrationV1>(manifest: T): T;

export declare function defineModule<T extends ModuleRegistrationV1>(
  manifest: T,
): Readonly<
  Omit<
    T,
    | "dependsOn"
    | "requiredEnv"
    | "migrations"
    | "routes"
    | "navigation"
    | "permissions"
    | "workflowActions"
    | "integrationPorts"
  > & {
    dependsOn: ModuleId[];
    requiredEnv: ModuleRequiredEnv[];
    migrations: ModuleMigrationDescriptor[];
    routes: ModuleRouteDescriptor[];
    navigation: ModuleNavigationItem[];
    permissions: ModulePermissionDescriptor[];
    workflowActions: ModuleWorkflowActionDescriptor[];
    integrationPorts: ModuleIntegrationPortDescriptor[];
  }
>;

export declare function getModuleCapabilities(manifest: ModuleRegistrationV1): ModuleCapabilityType[];
