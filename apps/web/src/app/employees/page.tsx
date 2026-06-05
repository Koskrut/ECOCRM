"use client";

import { useCallback, useEffect, useState } from "react";
import type { Employee } from "./EmployeeModal";
import { EmployeeModal } from "./EmployeeModal";
import {
  OrgChartFlow,
  loadAssignments,
  saveAssignments,
  loadRegionAssignments,
  saveRegionAssignments,
  loadExtraSlots,
  saveExtraSlots,
  getSlotLabelForEmployee,
  getRegionsForEmployee,
  type OrgAssignments,
  type RegionAssignments,
} from "./OrgChartFlow";
import { apiHttp } from "../../lib/api/client";
import { ErrorPanel, PageLoading } from "@/components/feedback";
import { formatUserRole } from "@/lib/roleLabels";

type UsersResponse = {
  items?: Employee[];
};

type Tab = "list" | "structure";

export default function EmployeesPage() {
  const [tab, setTab] = useState<Tab>("list");
  const [items, setItems] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<OrgAssignments>(() => loadAssignments());
  const [regionAssignments, setRegionAssignments] = useState<RegionAssignments>(() =>
    loadRegionAssignments()
  );
  const [extraSlotIds, setExtraSlotIds] = useState<string[]>(() => loadExtraSlots());

  const [modalOpen, setModalOpen] = useState(false);
  const [structureSaveStatus, setStructureSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [structureSaveError, setStructureSaveError] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editing, setEditing] = useState<Employee | null>(null);

  useEffect(() => {
    saveAssignments(assignments);
  }, [assignments]);

  useEffect(() => {
    saveRegionAssignments(regionAssignments);
  }, [regionAssignments]);

  useEffect(() => {
    saveExtraSlots(extraSlotIds);
  }, [extraSlotIds]);

  useEffect(() => {
    if (items.length === 0) return;
    const ids = new Set(items.map((e) => e.id));
    setAssignments((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const slotId of Object.keys(next)) {
        const empId = next[slotId];
        if (empId && !ids.has(empId)) {
          delete next[slotId];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [items]);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await apiHttp.get<UsersResponse | Employee[]>("/users");
      if (r.status >= 400) throw new Error((r.data as unknown as string) || `Failed (${r.status})`);
      const data = r.data as UsersResponse | Employee[];
      const list = Array.isArray(data) ? data : (data?.items ?? []);
      setItems(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load employees");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    apiHttp
      .get<{ assignments: OrgAssignments; extraSlots: string[]; regions: RegionAssignments }>("/settings/org-chart")
      .then((r) => {
        if (r.status >= 400) return;
        const d = r.data;
        if (d?.assignments && typeof d.assignments === "object") {
          setAssignments(d.assignments);
          saveAssignments(d.assignments);
        }
        if (Array.isArray(d?.extraSlots)) {
          setExtraSlotIds(d.extraSlots);
          saveExtraSlots(d.extraSlots);
        }
        if (d?.regions && typeof d.regions === "object") {
          setRegionAssignments(d.regions);
          saveRegionAssignments(d.regions);
        }
      })
      .catch(() => {});
  }, []);

  const saveStructure = useCallback(async () => {
    setStructureSaveStatus("saving");
    setStructureSaveError(null);
    try {
      await apiHttp.patch("/settings/org-chart", {
        assignments,
        extraSlots: extraSlotIds,
        regions: regionAssignments,
      });
      setStructureSaveStatus("saved");
      setTimeout(() => setStructureSaveStatus("idle"), 2000);
    } catch (e) {
      const message =
        (e as { response?: { data?: { message?: string | string[]; error?: string } } })?.response?.data?.message ??
        (e as { response?: { data?: { message?: string | string[]; error?: string } } })?.response?.data?.error ??
        (e instanceof Error ? e.message : "unknown");
      setStructureSaveError(Array.isArray(message) ? message.join(" | ") : String(message));
      setStructureSaveStatus("error");
      setTimeout(() => {
        setStructureSaveStatus("idle");
        setStructureSaveError(null);
      }, 3000);
    }
  }, [assignments, extraSlotIds, regionAssignments]);

  const openCreate = () => {
    setModalMode("create");
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (u: Employee) => {
    setModalMode("edit");
    setEditing(u);
    setModalOpen(true);
  };

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Employees</h1>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-zinc-200 bg-zinc-100/80 p-0.5">
            <button
              type="button"
              onClick={() => setTab("list")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === "list" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              Список
            </button>
            <button
              type="button"
              onClick={() => setTab("structure")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === "structure" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              Структура отдела
            </button>
          </div>
          {tab === "list" && (
            <button
              type="button"
              onClick={openCreate}
              className="btn-primary"
            >
              + Add employee
            </button>
          )}
        </div>
      </div>

      {tab === "structure" && (
        <div className="mt-4">
          {structureSaveStatus === "saved" && (
            <div className="mb-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Структура сохранена
            </div>
          )}
          {structureSaveStatus === "error" && (
            <div className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              {structureSaveError ?? "Не удалось сохранить структуру"}
            </div>
          )}
          <OrgChartFlow
            employees={items}
            assignments={assignments}
            regionAssignments={regionAssignments}
            extraSlotIds={extraSlotIds}
            onAssignmentChange={(slotId, employeeId) =>
              setAssignments((prev) => ({ ...prev, [slotId]: employeeId }))
            }
            onRegionsChange={(slotId, regions) =>
              setRegionAssignments((prev) => ({ ...prev, [slotId]: regions }))
            }
            onExtraSlotsChange={setExtraSlotIds}
            onRemoveSlot={(slotId) => {
              setAssignments((prev) => {
                const next = { ...prev };
                delete next[slotId];
                return next;
              });
              setRegionAssignments((prev) => {
                const next = { ...prev };
                delete next[slotId];
                return next;
              });
            }}
            onSaveStructure={saveStructure}
            isSavingStructure={structureSaveStatus === "saving"}
          />
        </div>
      )}

      {tab === "list" && (
      <div className="mt-4 rounded-lg border border-zinc-200 bg-white">
        {loading ? (
          <div className="p-4">
            <PageLoading inline />
          </div>
        ) : err ? (
          <div className="p-4">
            <ErrorPanel variant="inline" message={err} onRetry={() => void load()} />
          </div>
        ) : items.length === 0 ? (
          <div className="p-4 text-sm text-zinc-500">No employees</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 text-xs text-zinc-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Позиция в структуре</th>
                <th className="px-4 py-3">Области</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id} className="border-b border-zinc-100 last:border-b-0">
                  <td className="px-4 py-3 text-zinc-900">{u.fullName ?? "—"}</td>
                  <td className="px-4 py-3 text-zinc-700">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-700">
                      {formatUserRole(u.role)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {getSlotLabelForEmployee(assignments, u.id) ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-600 text-xs">
                    {getRegionsForEmployee(assignments, regionAssignments, u.id).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => openEdit(u)}
                      className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      )}

      <EmployeeModal
        open={modalOpen}
        mode={modalMode}
        initial={editing}
        allEmployees={items}
        onClose={() => setModalOpen(false)}
        onSaved={load}
      />
    </div>
  );
}
