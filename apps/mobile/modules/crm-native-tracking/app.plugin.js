const { withSettingsGradle } = require("@expo/config-plugins");

const KSP_VERSION = "2.1.20-2.0.1";

/** Ensures KSP is resolvable for Room during EAS / expo prebuild. */
module.exports = function withCrmNativeTracking(config) {
  return withSettingsGradle(config, (gradleConfig) => {
    let contents = gradleConfig.modResults.contents;
    const marker = "com.google.devtools.ksp";
    if (!contents.includes(marker)) {
      contents = contents.replace(
        /pluginManagement\s*\{/,
        `pluginManagement {
  plugins {
    id("${marker}") version "${KSP_VERSION}"
  }`,
      );
    }
    gradleConfig.modResults.contents = contents;
    return gradleConfig;
  });
};
