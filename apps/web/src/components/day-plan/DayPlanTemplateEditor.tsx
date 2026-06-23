"use client";

import type { DayPlanTemplateItem, DayPlanThresholds } from "@/lib/api/resources/day-plan";
import {
  enabledWeightSum,
  isDynamicDayPlanKey,
} from "@/lib/api/resources/day-plan-settings";
import { strings } from "@/locales";

const t = strings.dayPlan.settings;

const inputClass =
  "w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900 disabled:bg-zinc-100";

type DayPlanTemplateEditorProps = {
  items: DayPlanTemplateItem[];
  thresholds: DayPlanThresholds;
  onItemsChange: (items: DayPlanTemplateItem[]) => void;
  onThresholdsChange: (thresholds: DayPlanThresholds) => void;
  readOnly?: boolean;
  showThresholds?: boolean;
  globalBaseHint?: DayPlanTemplateItem[];
};

export function DayPlanTemplateEditor({
  items,
  thresholds,
  onItemsChange,
  onThresholdsChange,
  readOnly = false,
  showThresholds = true,
  globalBaseHint,
}: DayPlanTemplateEditorProps) {
  const weightSum = enabledWeightSum(items);
  const weightsOk = weightSum === 100;

  const updateItem = (key: DayPlanTemplateItem["key"], patch: Partial<DayPlanTemplateItem>) => {
    onItemsChange(
      items.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  };

  return (
    <div className="space-y-4">
      {showThresholds ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-zinc-700">{t.greenThreshold}</span>
            <input
              type="number"
              min={0}
              max={100}
              disabled={readOnly}
              value={thresholds.green}
              onChange={(e) =>
                onThresholdsChange({ ...thresholds, green: Number(e.target.value) || 0 })
              }
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700">{t.yellowThreshold}</span>
            <input
              type="number"
              min={0}
              max={100}
              disabled={readOnly}
              value={thresholds.yellow}
              onChange={(e) =>
                onThresholdsChange({ ...thresholds, yellow: Number(e.target.value) || 0 })
              }
              className={`${inputClass} mt-1`}
            />
          </label>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-zinc-200">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-2">{t.colEnabled}</th>
              <th className="px-3 py-2">{t.colItem}</th>
              <th className="px-3 py-2">{t.colPlan}</th>
              <th className="px-3 py-2">{t.colWeight}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const dynamic = isDynamicDayPlanKey(item.key);
              const zeroTarget = item.kind === "zero_target";
              const base = globalBaseHint?.find((g) => g.key === item.key);
              return (
                <tr key={item.key} className="border-b border-zinc-100 last:border-0">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={item.enabled !== false}
                      disabled={readOnly}
                      onChange={(e) => updateItem(item.key, { enabled: e.target.checked })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-zinc-900">{item.label}</div>
                    {base ? (
                      <div className="text-xs text-zinc-500">
                        {t.globalBaseHint(
                          zeroTarget || dynamic ? t.auto.toLowerCase() : base.target,
                          base.weight,
                        )}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {dynamic || zeroTarget ? (
                      <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                        {zeroTarget ? "0" : t.auto}
                      </span>
                    ) : (
                      <input
                        type="number"
                        min={0}
                        disabled={readOnly || item.enabled === false}
                        value={item.target}
                        onChange={(e) =>
                          updateItem(item.key, { target: Number(e.target.value) || 0 })
                        }
                        className={inputClass}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      disabled={readOnly || item.enabled === false}
                      value={item.weight}
                      onChange={(e) =>
                        updateItem(item.key, { weight: Number(e.target.value) || 0 })
                      }
                      className={inputClass}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className={`text-sm ${weightsOk ? "text-zinc-600" : "text-red-700"}`}>
        {t.weightSumLabel}{" "}
        <span className="font-semibold tabular-nums">{weightSum}%</span>
        {!weightsOk ? t.weightMustBe100 : null}
      </p>
    </div>
  );
}

export function itemsToOverrides(items: DayPlanTemplateItem[]): Partial<DayPlanTemplateItem>[] {
  return items.map(({ key, target, weight, enabled, label }) => ({
    key,
    target,
    weight,
    enabled,
    label,
  }));
}
