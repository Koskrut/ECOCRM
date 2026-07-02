import { requireNativeModule } from "expo-modules-core";

type CrmBatteryModule = {
  isIgnoringBatteryOptimizations(): Promise<boolean>;
};

let nativeModule: CrmBatteryModule | null = null;

try {
  nativeModule = requireNativeModule<CrmBatteryModule>("CrmBattery");
} catch {
  nativeModule = null;
}

export async function isIgnoringBatteryOptimizations(): Promise<boolean | null> {
  if (!nativeModule) return null;
  try {
    return await nativeModule.isIgnoringBatteryOptimizations();
  } catch {
    return null;
  }
}
