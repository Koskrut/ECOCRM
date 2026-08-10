/** Build `package:` URI for Android REQUEST_IGNORE_BATTERY_OPTIMIZATIONS intent. */
export function buildBatteryOptimizationPackageUri(packageName: string): string {
  return `package:${packageName}`;
}
