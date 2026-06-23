"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiHttp } from "@/lib/api/client";
import { getUserFriendlyApiError } from "@/lib/api/errors";
import type { DayPlanProfile, DayPlanTemplateItem, DayPlanThresholds } from "@/lib/api/resources/day-plan";
import {
  dayPlanSettingsApi,
  enabledWeightSum,
  type DayPlanGlobalSettingsPayload,
  type DayPlanUserSettingsPayload,
} from "@/lib/api/resources/day-plan-settings";
import {
  DayPlanTemplateEditor,
  itemsToOverrides,
} from "@/components/day-plan/DayPlanTemplateEditor";
import { ErrorPanel, PageLoading } from "@/components/feedback";
import { SettingsPageShell } from "@/components/SettingsPageShell";
import { strings } from "@/locales";

type MeResponse = { user?: { role?: string } };
type EmployeeOption = { id: string; fullName: string };

const t = strings.dayPlan.settings;

export default function DayPlanSettingsPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <DayPlanSettingsContent />
    </Suspense>
  );
}

function DayPlanSettingsContent() {
  const searchParams = useSearchParams();
  const queryUserId = searchParams.get("userId") ?? "";

  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [globalConfig, setGlobalConfig] = useState<DayPlanGlobalSettingsPayload | null>(null);
  const [profileTab, setProfileTab] = useState<DayPlanProfile>("office");
  const [thresholds, setThresholds] = useState<DayPlanThresholds>({ green: 80, yellow: 50 });
  const [officeItems, setOfficeItems] = useState<DayPlanTemplateItem[]>([]);
  const [fieldItems, setFieldItems] = useState<DayPlanTemplateItem[]>([]);

  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [userConfig, setUserConfig] = useState<DayPlanUserSettingsPayload | null>(null);
  const [userItems, setUserItems] = useState<DayPlanTemplateItem[]>([]);
  const [userThresholds, setUserThresholds] = useState<DayPlanThresholds>({ green: 80, yellow: 50 });

  const isAdmin = role === "ADMIN";
  const canEditUser = role === "ADMIN" || role === "LEAD";

  const activeGlobalItems = profileTab === "office" ? officeItems : fieldItems;
  const setActiveGlobalItems = profileTab === "office" ? setOfficeItems : setFieldItems;

  const loadGlobal = useCallback(async () => {
    const data = await dayPlanSettingsApi.getGlobal();
    setGlobalConfig(data);
    setThresholds(data.thresholds);
    setOfficeItems(data.office.items);
    setFieldItems(data.field.items);
  }, []);

  const loadEmployees = useCallback(async () => {
    const res = await apiHttp.get<{ items?: EmployeeOption[] } | EmployeeOption[]>("/users");
    const raw = res.data;
    const list = Array.isArray(raw) ? raw : (raw?.items ?? []);
    setEmployees(
      list
        .map((u) => ({ id: u.id, fullName: u.fullName ?? u.id }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName)),
    );
  }, []);

  const loadUser = useCallback(async (userId: string) => {
    if (!userId) {
      setUserConfig(null);
      setUserItems([]);
      return;
    }
    const data = await dayPlanSettingsApi.getUser(userId);
    setUserConfig(data);
    setUserItems(data.items);
    setUserThresholds(data.thresholds);
  }, []);

  useEffect(() => {
    void apiHttp
      .get<MeResponse>("/auth/me")
      .then((r) => setRole(r.data?.user?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  useEffect(() => {
    if (queryUserId) setSelectedUserId(queryUserId);
  }, [queryUserId]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([loadGlobal(), loadEmployees()])
      .catch((e) => setError(getUserFriendlyApiError(e, t.loadFailed)))
      .finally(() => setLoading(false));
  }, [loadGlobal, loadEmployees]);

  useEffect(() => {
    if (!selectedUserId) return;
    void loadUser(selectedUserId).catch((e) =>
      setError(getUserFriendlyApiError(e, t.loadUserFailed)),
    );
  }, [selectedUserId, loadUser]);

  const globalWeightOk = useMemo(
    () => enabledWeightSum(activeGlobalItems) === 100,
    [activeGlobalItems],
  );
  const userWeightOk = useMemo(() => enabledWeightSum(userItems) === 100, [userItems]);

  async function saveGlobal() {
    if (!isAdmin || !globalWeightOk) return;
    setSaving(true);
    setError(null);
    try {
      const body =
        profileTab === "office"
          ? { thresholds, office: { items: itemsToOverrides(officeItems) } }
          : { thresholds, field: { items: itemsToOverrides(fieldItems) } };
      const data = await dayPlanSettingsApi.setGlobal(body);
      setGlobalConfig(data);
      setThresholds(data.thresholds);
      setOfficeItems(data.office.items);
      setFieldItems(data.field.items);
    } catch (e) {
      setError(getUserFriendlyApiError(e, t.saveFailed));
    } finally {
      setSaving(false);
    }
  }

  async function resetGlobalProfile() {
    if (!isAdmin) return;
    setSaving(true);
    setError(null);
    try {
      const data = await dayPlanSettingsApi.setGlobal(
        profileTab === "office" ? { resetOffice: true } : { resetField: true },
      );
      setGlobalConfig(data);
      setThresholds(data.thresholds);
      setOfficeItems(data.office.items);
      setFieldItems(data.field.items);
    } catch (e) {
      setError(getUserFriendlyApiError(e, t.resetFailed));
    } finally {
      setSaving(false);
    }
  }

  async function saveUser() {
    if (!canEditUser || !selectedUserId || !userWeightOk) return;
    setSaving(true);
    setError(null);
    try {
      const data = await dayPlanSettingsApi.setUser(selectedUserId, {
        items: itemsToOverrides(userItems),
        thresholds: userThresholds,
      });
      setUserConfig(data);
      setUserItems(data.items);
      setUserThresholds(data.thresholds);
    } catch (e) {
      setError(getUserFriendlyApiError(e, t.saveUserFailed));
    } finally {
      setSaving(false);
    }
  }

  async function resetUser() {
    if (!canEditUser || !selectedUserId) return;
    setSaving(true);
    setError(null);
    try {
      const data = await dayPlanSettingsApi.deleteUser(selectedUserId);
      setUserConfig(data);
      setUserItems(data.items);
      setUserThresholds(data.thresholds);
    } catch (e) {
      setError(getUserFriendlyApiError(e, t.resetUserFailed));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageLoading />;

  return (
    <SettingsPageShell
      title={t.pageTitle}
      subtitle={t.pageSubtitle}
      maxWidthClassName="max-w-4xl"
    >
      {error ? <ErrorPanel message={error} className="mb-4" /> : null}

      {isAdmin ? (
        <section className="mb-8 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">{t.globalSection}</h2>
          <p className="mt-1 text-sm text-zinc-500">{t.globalSectionDesc}</p>

          <div className="mt-4 flex gap-2">
            {(["office", "field"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setProfileTab(tab)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  profileTab === tab
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                }`}
              >
                {tab === "office" ? t.profileOffice : t.profileField}
              </button>
            ))}
          </div>

          <div className="mt-4">
            <DayPlanTemplateEditor
              items={activeGlobalItems}
              thresholds={thresholds}
              onItemsChange={setActiveGlobalItems}
              onThresholdsChange={setThresholds}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving || !globalWeightOk}
              onClick={() => void saveGlobal()}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {saving ? t.saving : t.saveTemplate}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void resetGlobalProfile()}
              className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              {t.resetProfile}
            </button>
          </div>
        </section>
      ) : (
        <div className="mb-8 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          {t.globalReadOnlyHint}
        </div>
      )}

      {canEditUser ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">{t.individualSection}</h2>
          <p className="mt-1 text-sm text-zinc-500">{t.individualSectionDesc}</p>

          <label className="mt-4 block text-sm">
            <span className="font-medium text-zinc-700">{t.selectEmployee}</span>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="mt-1 w-full max-w-md rounded-md border border-zinc-200 px-3 py-2 text-sm"
            >
              <option value="">{t.selectEmployeePlaceholder}</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName}
                </option>
              ))}
            </select>
          </label>

          {userConfig && selectedUserId ? (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-zinc-600">
                <span>
                  {t.profileLabel}:{" "}
                  <span className="font-medium text-zinc-900">
                    {userConfig.profile === "field" ? t.profileFieldLower : t.profileOfficeLower}
                  </span>
                </span>
                {userConfig.hasCustomOverride ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                    {t.customBadge}
                  </span>
                ) : null}
              </div>

              <div className="mt-4">
                <DayPlanTemplateEditor
                  items={userItems}
                  thresholds={userThresholds}
                  onItemsChange={setUserItems}
                  onThresholdsChange={setUserThresholds}
                  globalBaseHint={userConfig.globalBase}
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={saving || !userWeightOk}
                  onClick={() => void saveUser()}
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  {saving ? t.saving : t.saveForEmployee}
                </button>
                {userConfig.hasCustomOverride ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void resetUser()}
                    className="rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    {t.resetToGlobal}
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      {globalConfig ? (
        <p className="mt-4 text-xs text-zinc-400">{t.profileAutoHint}</p>
      ) : null}
    </SettingsPageShell>
  );
}
