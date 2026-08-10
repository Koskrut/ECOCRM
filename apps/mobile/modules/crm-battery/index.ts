import { requireNativeModule } from "expo-modules-core";

type CrmBatteryModule = {
  /** null when React context is not ready — never treat as restricted. */
  isIgnoringBatteryOptimizations(): Promise<boolean | null>;
  /** null when React context is not ready — never treat as denied. */
  hasBackgroundLocationPermission(): Promise<boolean | null>;
  /** null when React context is not ready — never treat as denied. */
  hasFineLocationPermission(): Promise<boolean | null>;
};

let nativeModule: CrmBatteryModule | null = null;

try {
  nativeModule = requireNativeModule<CrmBatteryModule>("CrmBattery");
} catch {
  nativeModule = null;
}

export function isBatteryModuleLoaded(): boolean {
  return nativeModule != null;
}

export async function isIgnoringBatteryOptimizations(): Promise<boolean | null> {
  if (!nativeModule) return null;
  try {
    return await nativeModule.isIgnoringBatteryOptimizations();
  } catch {
    return null;
  }
}

/** Android ContextCompat/PermissionChecker for ACCESS_BACKGROUND_LOCATION. */
export async function hasBackgroundLocationPermission(): Promise<boolean | null> {
  if (!nativeModule) return null;
  try {
    return await nativeModule.hasBackgroundLocationPermission();
  } catch {
    return null;
  }
}

export async function hasFineLocationPermission(): Promise<boolean | null> {
  if (!nativeModule) return null;
  try {
    return await nativeModule.hasFineLocationPermission();
  } catch {
    return null;
  }
}
