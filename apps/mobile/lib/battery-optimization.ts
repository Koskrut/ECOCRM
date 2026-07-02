import { Platform } from "react-native";

import { isIgnoringBatteryOptimizations } from "../modules/crm-battery";
import type { BatteryOptimizationStatus } from "./location-tracking-restart";

export async function readBatteryOptimizationStatus(): Promise<BatteryOptimizationStatus> {
  if (Platform.OS !== "android") return "unknown";

  const ignored = await isIgnoringBatteryOptimizations();
  if (ignored == null) return "unknown";
  return ignored ? "unrestricted" : "restricted";
}
