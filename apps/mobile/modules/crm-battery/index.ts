import { requireNativeModule } from "expo-modules-core";

type CrmBatteryModule = {
  /** null when React context is not ready — never treat as restricted. */
  isIgnoringBatteryOptimizations(): Promise<boolean | null>;
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
