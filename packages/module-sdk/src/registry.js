"use strict";

const { assertModuleManifestV1 } = require("./manifest");

function createModuleRegistry(initialModules = []) {
  const modules = new Map();

  function register(manifest) {
    assertModuleManifestV1(manifest);

    if (modules.has(manifest.id)) {
      throw new Error(`Module "${manifest.id}" is already registered`);
    }

    modules.set(manifest.id, manifest);
    return manifest;
  }

  for (const manifest of initialModules) {
    register(manifest);
  }

  return {
    register,
    get(id) {
      return modules.get(id) ?? null;
    },
    has(id) {
      return modules.has(id);
    },
    list() {
      return [...modules.values()].sort((a, b) => a.id.localeCompare(b.id));
    },
    ids() {
      return [...modules.keys()].sort();
    },
  };
}

module.exports = {
  createModuleRegistry,
};
