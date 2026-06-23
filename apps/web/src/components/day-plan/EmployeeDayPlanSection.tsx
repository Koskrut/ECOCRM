"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiHttp } from "@/lib/api/client";
import { getUserFriendlyApiError } from "@/lib/api/errors";
import type { DayPlanTemplateItem, DayPlanThresholds } from "@/lib/api/resources/day-plan";
import {
  dayPlanSettingsApi,
  enabledWeightSum,
} from "@/lib/api/resources/day-plan-settings";
import {
  DayPlanTemplateEditor,
  itemsToOverrides,
} from "@/components/day-plan/DayPlanTemplateEditor";
import { strings } from "@/locales";

const t = strings.dayPlan.settings;

type EmployeeDayPlanSectionProps = {
  userId: string;
  fullName?: string | null;
};

export function EmployeeDayPlanSection({ userId }: EmployeeDayPlanSectionProps) {
  const [actorRole, setActorRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasCustomOverride, setHasCustomOverride] = useState(false);
  const [profile, setProfile] = useState<"office" | "field">("office");
  const [items, setItems] = useState<DayPlanTemplateItem[]>([]);
  const [thresholds, setThresholds] = useState<DayPlanThresholds>({ green: 80, yellow: 50 });
  const [globalBase, setGlobalBase] = useState<DayPlanTemplateItem[]>([]);

  const canEdit = actorRole === "ADMIN" || actorRole === "LEAD";
  const weightOk = enabledWeightSum(items) === 100;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await dayPlanSettingsApi.getUser(userId);
      setHasCustomOverride(data.hasCustomOverride);
      setProfile(data.profile);
      setItems(data.items);
      setThresholds(data.thresholds);
      setGlobalBase(data.globalBase);
    } catch (e) {
      setError(getUserFriendlyApiError(e, t.loadUserFailed));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((r) => setActorRole(r.data?.user?.role ?? null))
      .catch(() => setActorRole(null));
  }, []);

  useEffect(() => {
    if (!userId || !canEdit) {
      setLoading(false);
      return;
    }
    void load();
  }, [userId, canEdit, load]);

  if (!canEdit) return null;

  return (
    <section className="border-t border-zinc-200 pt-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {t.sectionTitle}
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            {t.profileLabel}: {profile === "field" ? t.profileFieldLower : t.profileOfficeLower}
            {hasCustomOverride ? (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                {strings.dayPlan.customPlanShort}
              </span>
            ) : null}
          </p>
        </div>
        <Link
          href={`/settings/day-plan?userId=${encodeURIComponent(userId)}`}
          className="text-xs font-medium text-zinc-600 hover:text-zinc-900"
        >
          {t.openInSettings}
        </Link>
      </div>

      {error ? <p className="mb-2 text-sm text-red-700">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-zinc-500">{strings.common.loading}</p>
      ) : (
        <>
          <DayPlanTemplateEditor
            items={items}
            thresholds={thresholds}
            onItemsChange={setItems}
            onThresholdsChange={setThresholds}
            globalBaseHint={globalBase}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving || !weightOk}
              onClick={() => {
                setSaving(true);
                void dayPlanSettingsApi
                  .setUser(userId, {
                    items: itemsToOverrides(items),
                    thresholds,
                  })
                  .then((data) => {
                    setHasCustomOverride(data.hasCustomOverride);
                    setItems(data.items);
                    setThresholds(data.thresholds);
                  })
                  .catch((e) =>
                    setError(getUserFriendlyApiError(e, t.saveUserFailed)),
                  )
                  .finally(() => setSaving(false));
              }}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {saving ? t.saving : t.savePlan}
            </button>
            {hasCustomOverride ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setSaving(true);
                  void dayPlanSettingsApi
                    .deleteUser(userId)
                    .then((data) => {
                      setHasCustomOverride(data.hasCustomOverride);
                      setItems(data.items);
                      setThresholds(data.thresholds);
                      setGlobalBase(data.globalBase);
                    })
                    .catch((e) =>
                      setError(getUserFriendlyApiError(e, t.resetUserFailed)),
                    )
                    .finally(() => setSaving(false));
                }}
                className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                {t.resetToGlobal}
              </button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
