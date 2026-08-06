import { Platform } from "react-native";

import {
  isBatteryModuleLoaded,
  isIgnoringBatteryOptimizations,
} from "../modules/crm-battery";
import type { BatteryOptimizationStatus } from "./location-tracking-restart";

export { shouldShowBatteryOptimizationWarning } from "./battery-optimization-logic";

export type BatteryOptimizationReadResult = {
  status: BatteryOptimizationStatus;
  moduleLoaded: boolean;
  rawIgnoring: boolean | null;
};

export async function readBatteryOptimizationDetailed(): Promise<BatteryOptimizationReadResult> {
  if (Platform.OS !== "android") {
    return { status: "unknown", moduleLoaded: false, rawIgnoring: null };
  }

  const moduleLoaded = isBatteryModuleLoaded();
  const raw = await isIgnoringBatteryOptimizations();
  if (raw == null) {
    return { status: "unknown", moduleLoaded, rawIgnoring: null };
  }
  return {
    status: raw ? "unrestricted" : "restricted",
    moduleLoaded,
    rawIgnoring: raw,
  };
}

export async function readBatteryOptimizationStatus(): Promise<BatteryOptimizationStatus> {
  const detailed = await readBatteryOptimizationDetailed();
  return detailed.status;
}
