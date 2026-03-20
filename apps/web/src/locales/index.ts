import { deepMerge } from "./merge";
import { en, type AppMessages } from "./en";
import { uk } from "./uk";

export const strings = deepMerge(
  en as unknown as Record<string, unknown>,
  uk as unknown as Record<string, unknown>,
) as AppMessages;

export type { AppMessages } from "./en";
export { en, uk, deepMerge };
