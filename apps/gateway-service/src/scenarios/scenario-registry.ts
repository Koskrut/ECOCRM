import { DORMANT_REACTIVATION_CODE } from "./dormant-reactivation.scenario";

export function isSupportedScenario(code: string): boolean {
  return code === DORMANT_REACTIVATION_CODE || code === "LEAD_QUALIFICATION" || code.length > 0;
}
