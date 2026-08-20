import AsyncStorage from "@react-native-async-storage/async-storage";

import { newUuidV4 } from "./tracking-ids";

const DEVICE_ID_KEY = "field_tracking_device_id";

export async function getTrackingDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing && existing.trim().length > 0) {
    return existing.trim();
  }
  const next = newUuidV4();
  await AsyncStorage.setItem(DEVICE_ID_KEY, next);
  return next;
}
