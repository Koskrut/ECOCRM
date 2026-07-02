import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";

import { runBackgroundTrackingWatchdog } from "./location-tracking";

export const FIELD_TRACKING_WATCHDOG_TASK = "FIELD_TRACKING_WATCHDOG_TASK";

if (!TaskManager.isTaskDefined(FIELD_TRACKING_WATCHDOG_TASK)) {
  TaskManager.defineTask(FIELD_TRACKING_WATCHDOG_TASK, async () => {
    try {
      await runBackgroundTrackingWatchdog();
      return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch {
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
}

const WATCHDOG_INTERVAL_SEC = 15 * 60;

export async function registerBackgroundTrackingWatchdog(): Promise<void> {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (
      status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
      status === BackgroundFetch.BackgroundFetchStatus.Denied
    ) {
      return;
    }

    const registered = await TaskManager.isTaskRegisteredAsync(FIELD_TRACKING_WATCHDOG_TASK);
    if (!registered) {
      await BackgroundFetch.registerTaskAsync(FIELD_TRACKING_WATCHDOG_TASK, {
        minimumInterval: WATCHDOG_INTERVAL_SEC,
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }
  } catch {
    /* watchdog is best-effort */
  }
}

export async function unregisterBackgroundTrackingWatchdog(): Promise<void> {
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(FIELD_TRACKING_WATCHDOG_TASK);
    if (registered) {
      await BackgroundFetch.unregisterTaskAsync(FIELD_TRACKING_WATCHDOG_TASK);
    }
  } catch {
    /* ignore */
  }
}
