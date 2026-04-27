"use strict";

const ModuleCapabilityTypes = {
  Routes: "routes",
  Navigation: "navigation",
  Permissions: "permissions",
  WorkflowActions: "workflowActions",
  IntegrationPorts: "integrationPorts",
  Health: "health",
};

function requireString(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`Module manifest field "${field}" must be a non-empty string`);
  }
}

function requireArray(value, field) {
  if (!Array.isArray(value)) {
    throw new TypeError(`Module manifest field "${field}" must be an array`);
  }
}

function assertModuleManifestV1(manifest) {
  if (!manifest || typeof manifest !== "object") {
    throw new TypeError("Module manifest must be an object");
  }

  requireString(manifest.id, "id");
  requireString(manifest.kind, "kind");
  requireString(manifest.displayName, "displayName");
  requireString(manifest.description, "description");
  requireString(manifest.delivery, "delivery");
  requireArray(manifest.dependsOn, "dependsOn");

  if (manifest.version !== 1) {
    throw new TypeError('Module manifest field "version" must be 1');
  }

  if (!manifest.controlPlane || typeof manifest.controlPlane !== "object") {
    throw new TypeError('Module manifest field "controlPlane" must be an object');
  }

  if (manifest.controlPlane.entitlementKey !== manifest.id) {
    throw new TypeError('Module manifest field "controlPlane.entitlementKey" must match "id"');
  }

  if (typeof manifest.controlPlane.bundleSelectable !== "boolean") {
    throw new TypeError('Module manifest field "controlPlane.bundleSelectable" must be a boolean');
  }

  return manifest;
}

function copyArray(value) {
  return Array.isArray(value) ? [...value] : [];
}

function defineModule(manifest) {
  assertModuleManifestV1(manifest);

  return Object.freeze({
    ...manifest,
    dependsOn: copyArray(manifest.dependsOn),
    requiredEnv: copyArray(manifest.requiredEnv),
    migrations: copyArray(manifest.migrations),
    routes: copyArray(manifest.routes),
    navigation: copyArray(manifest.navigation),
    permissions: copyArray(manifest.permissions),
    workflowActions: copyArray(manifest.workflowActions),
    integrationPorts: copyArray(manifest.integrationPorts),
  });
}

function getModuleCapabilities(manifest) {
  assertModuleManifestV1(manifest);

  return Object.values(ModuleCapabilityTypes).filter((capability) => {
    if (capability === ModuleCapabilityTypes.Health) return Boolean(manifest.health);
    return Array.isArray(manifest[capability]) && manifest[capability].length > 0;
  });
}

module.exports = {
  ModuleCapabilityTypes,
  assertModuleManifestV1,
  defineModule,
  getModuleCapabilities,
};
