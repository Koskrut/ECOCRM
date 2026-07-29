/**
 * Extends app.json and injects native Google Maps API keys when provided via EAS/env.
 *
 * Expo SDK 54 ships react-native-maps@1.20.1, which has NO config plugin
 * (`androidGoogleMapsApiKey` requires rn-maps >= 1.22). Use Expo's built-in
 * `android.config.googleMaps.apiKey` / `ios.config.googleMapsApiKey` instead —
 * `@expo/config-plugins` writes `com.google.android.geo.API_KEY` into AndroidManifest.
 *
 * Without that meta-data, mounting MapView kills the Android process.
 * Set EAS secret `GOOGLE_MAPS_API_KEY` (preferred) or `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`,
 * then run a NEW native EAS build (OTA/JS-only is not enough).
 */
const appJson = require("./app.json");

const googleMapsApiKey = (
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  ""
).trim();

const hasNativeGoogleMapsKey = googleMapsApiKey.length > 0;
const expo = appJson.expo;

module.exports = {
  expo: {
    ...expo,
    ios: {
      ...expo.ios,
      ...(hasNativeGoogleMapsKey
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
      ...(hasNativeGoogleMapsKey
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
    extra: {
      ...(expo.extra ?? {}),
      /** Runtime gate for DayRouteMapPanel — true only when key was baked at native build time. */
      enableInteractiveGoogleMaps: hasNativeGoogleMapsKey,
    },
  },
};
