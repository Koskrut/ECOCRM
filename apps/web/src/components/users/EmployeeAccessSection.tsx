"use client";

import { useCallback, useEffect, useState } from "react";
import { EntitySection } from "@/components/sections/EntitySection";
import { getUserFriendlyApiError } from "@/lib/api/errors";
import {
  rbacApi,
  type RbacAssignment,
  type RbacEffective,
  type RbacPermission,
  type RbacRole,
} from "@/lib/api/resources/rbac";
import { formatUserRole } from "@/lib/roleLabels";
import { strings } from "@/locales";

const t = strings.employees.modal.access;

type EmployeeAccessSectionProps = {
  userId: string;
  userName: string;
  legacyRole: string;
};

export function EmployeeAccessSection({ userId, userName, legacyRole }: EmployeeAccessSectionProps) {
  const [catalogRoles, setCatalogRoles] = useState<RbacRole[]>([]);
  const [catalogPermissions, setCatalogPermissions] = useState<RbacPermission[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [assignments, setAssignments] = useState<RbacAssignment[]>([]);
  const [effective, setEffective] = useState<RbacEffective | null>(null);
  const [loadingRbac, setLoadingRbac] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const customRoles = catalogRoles.filter((role) => !role.system);

  const loadCatalog = useCallback(async () => {
    setLoadingRbac(true);
    try {
      const data = await rbacApi.listCatalog();
      setCatalogRoles(data.roles);
      setCatalogPermissions(data.permissions);
    } catch (e) {
      setError(getUserFriendlyApiError(e));
    } finally {
      setLoadingRbac(false);
    }
  }, []);

  const loadUserAccess = useCallback(async () => {
    if (!userId) return;
    setError(null);
    try {
      const [assignmentsData, effectiveData] = await Promise.all([
        rbacApi.listAssignments(userId),
        rbacApi.effective(userId),
      ]);
      setAssignments(assignmentsData);
      setEffective(effectiveData);
    } catch (e) {
      setError(getUserFriendlyApiError(e));
    }
  }, [userId]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    void loadUserAccess();
  }, [loadUserAccess]);

  async function assignRole() {
    if (!userId || !selectedRoleId) return;
    setAssigning(true);
    setError(null);
    setMessage(null);
    try {
      await rbacApi.assignRole(userId, selectedRoleId);
      setMessage(t.assignSuccess);
      setSelectedRoleId("");
      await loadUserAccess();
    } catch (e) {
      setError(getUserFriendlyApiError(e));
    } finally {
      setAssigning(false);
    }
  }

  async function removeRole(roleId: string) {
    if (!userId) return;
    setAssigning(true);
    setError(null);
    setMessage(null);
    try {
      await rbacApi.removeRole(userId, roleId);
      setMessage(t.removeSuccess);
      await loadUserAccess();
    } catch (e) {
      setError(getUserFriendlyApiError(e));
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="space-y-4">
      {message ? (
        <div className="rounded-md border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}

      <EntitySection title={t.baseRole}>
        <p className="text-sm text-zinc-700">
          <span className="font-medium">{formatUserRole(legacyRole)}</span>
          <span className="ml-2 text-xs text-zinc-500">({legacyRole})</span>
        </p>
        <p className="mt-1 text-xs text-zinc-500">{t.editRoleHint}</p>
      </EntitySection>

      <EntitySection title={strings.employees.modal.tabAccess}>
        <p className="text-xs text-zinc-500">{t.intro}</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <label className="text-xs text-zinc-600 sm:col-span-2">
            {t.extraRole}
            <select
              className="mt-1 w-full rounded-md border border-zinc-200 px-2 py-1.5 text-sm"
              value={selectedRoleId}
              onChange={(e) => setSelectedRoleId(e.target.value)}
              disabled={loadingRbac || customRoles.length === 0 || assigning}
            >
              <option value="">{loadingRbac ? t.loadingRoles : t.selectRole}</option>
              {customRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.key})
                </option>
              ))}
            </select>
          </label>
          <div className="self-end">
            <button
              type="button"
              onClick={() => void assignRole()}
              disabled={!selectedRoleId || assigning}
              className="btn-primary w-full px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              {assigning ? t.assigning : t.assign}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-600">{t.assignedTitle}</h4>
            <p className="mt-1 text-xs text-zinc-500">
              {userName}
            </p>
            {assignments.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">{t.noAssigned}</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {assignments.map((item) => (
                  <li
                    key={item.role.id}
                    className="flex items-center justify-between rounded border border-zinc-200 bg-white px-3 py-2 text-sm"
                  >
                    <div>
                      <div className="font-medium text-zinc-900">{item.role.name}</div>
                      <div className="font-mono text-xs text-zinc-500">{item.role.key}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void removeRole(item.role.id)}
                      className="text-xs text-red-600 hover:text-red-700"
                      disabled={assigning}
                    >
                      {t.remove}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-600">{t.effectiveTitle}</h4>
            {!effective ? (
              <p className="mt-3 text-sm text-zinc-500">{strings.common.loading}</p>
            ) : (
              <>
                <p className="mt-1 text-xs text-zinc-500">
                  {t.baseRole}: <span className="font-medium text-zinc-700">{effective.legacyRole}</span>
                </p>
                <div className="mt-2 max-h-56 overflow-auto rounded border border-zinc-200 bg-white p-2">
                  {effective.permissions.length === 0 ? (
                    <p className="text-sm text-zinc-500">{t.noPermissions}</p>
                  ) : (
                    <ul className="space-y-1 text-xs text-zinc-700">
                      {effective.permissions.map((permissionKey) => (
                        <li key={permissionKey} className="font-mono">
                          {permissionKey}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
            {catalogPermissions.length > 0 ? (
              <p className="mt-2 text-[11px] text-zinc-500">{t.catalogHint(catalogPermissions.length)}</p>
            ) : null}
          </div>
        </div>
      </EntitySection>
    </div>
  );
}
