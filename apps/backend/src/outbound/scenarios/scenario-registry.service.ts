import { Injectable, NotFoundException } from "@nestjs/common";
import { dormantReactivationScenario } from "./dormant-reactivation.scenario";
import { leadQualificationScenario } from "./lead-qualification.scenario";
import type { ScenarioCode, ScenarioDefinition } from "./scenario.types";

const SCENARIOS: ScenarioDefinition[] = [leadQualificationScenario, dormantReactivationScenario];

@Injectable()
export class ScenarioRegistryService {
  private readonly byCodeVersion = new Map<string, ScenarioDefinition>();

  constructor() {
    for (const s of SCENARIOS) {
      this.byCodeVersion.set(`${s.code}@${s.version}`, s);
    }
  }

  list(): ScenarioDefinition[] {
    return [...SCENARIOS];
  }

  getLatest(code: ScenarioCode): ScenarioDefinition {
    const found = SCENARIOS.filter((s) => s.code === code).sort((a, b) =>
      b.version.localeCompare(a.version, undefined, { numeric: true }),
    );
    const latest = found[0];
    if (!latest) {
      throw new NotFoundException(`Unknown scenario code: ${code}`);
    }
    return latest;
  }

  getByCodeAndVersion(code: ScenarioCode, version: string): ScenarioDefinition {
    const def = this.byCodeVersion.get(`${code}@${version}`);
    if (!def) {
      throw new NotFoundException(`Unknown scenario ${code}@${version}`);
    }
    return def;
  }

  resolve(code: string, version: string): ScenarioDefinition {
    const c = code as ScenarioCode;
    if (version.trim()) {
      return this.getByCodeAndVersion(c, version);
    }
    return this.getLatest(c);
  }

  findOutcomeMapping(def: ScenarioDefinition, outcomeKey: string) {
    return def.outcomeMappings.find((m) => m.outcomeKey === outcomeKey) ?? null;
  }

  listValidOutcomeKeys(def: ScenarioDefinition): string[] {
    return def.outcomeMappings.map((m) => m.outcomeKey);
  }
}
