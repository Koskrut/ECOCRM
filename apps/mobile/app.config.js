/**
 * Extends app.json and injects native Google Maps API keys when provided via EAS/env.
 * Without android.config.googleMaps.apiKey, mounting MapView crashes the Android process.
 */
const appJson = require("./app.json");

const googleMapsApiKey = (
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  ""
).trim();

const expo = appJson.expo;

module.exports = {
  expo: {
    ...expo,
    ios: {
      ...expo.ios,
      ...(googleMapsApiKey
        ? {
            config: {
              ...(expo.ios?.config ?? {}),
              googleMapsApiKey,
            },
          }
        : {}),
    },
    android: {
      ...expo.android,
      ...(googleMapsApiKey
        ? {
            config: {
              ...(expo.android?.config ?? {}),
              googleMaps: {
                ...(expo.android?.config?.googleMaps ?? {}),
                apiKey: googleMapsApiKey,
              },
            },
          }
        : {}),
    },
  },
};
