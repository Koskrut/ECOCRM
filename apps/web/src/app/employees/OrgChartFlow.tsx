"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  Panel,
  type NodeTypes,
} from "@xyflow/react";
import { useReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Employee } from "./EmployeeModal";
import { OrgChartNode, type OrgNodeData } from "./OrgChartNode";

const ORG_STORAGE_KEY = "crm_org_chart_assignments";
const EXTRA_SLOTS_KEY = "crm_org_chart_extra_slots";
const REGIONS_STORAGE_KEY = "crm_org_chart_regions";

/** Список областей для выбора (укр. названия). Дублює apps/backend/src/store/checkout/uk-regions.ts — змінюйте обидва. */
const ORG_REGIONS_LIST = [
  "Вінницька",
  "Волинська",
  "Дніпропетровська",
  "Донецька",
  "Житомирська",
  "Закарпатська",
  "Запорізька",
  "Івано-Франківська",
  "Київ",
  "Київська",
  "Кіровоградська",
  "Луганська",
  "Львівська",
  "Миколаївська",
  "Одеська",
  "Полтавська",
  "Рівненська",
  "Сумська",
  "Тернопільська",
  "Харківська",
  "Херсонська",
  "Хмельницька",
  "Черкаська",
  "Чернівецька",
  "Чернігівська",
];

export type RegionAssignments = Record<string, string[]>;

export function loadRegionAssignments(): RegionAssignments {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(REGIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string[]>;
    return typeof parsed === "object" && parsed !== null ? { ...parsed } : {};
  } catch {
    return {};
  }
}

export function saveRegionAssignments(regions: RegionAssignments) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REGIONS_STORAGE_KEY, JSON.stringify(regions));
  } catch {
    /* ignore */
  }
}

/** Returns regions for an employee by their assigned slot. */
export function getRegionsForEmployee(
  assignments: OrgAssignments,
  regionAssignments: RegionAssignments,
  employeeId: string
): string[] {
  const slotId = Object.entries(assignments).find(([, id]) => id === employeeId)?.[0];
  if (!slotId) return [];
  const regions = regionAssignments[slotId];
  return Array.isArray(regions) ? regions : [];
}

const BASE_MANAGER_SLOTS = ["lead1", "lead2", "admin-manager", "m1-1", "m1-2", "m2-1", "m2-2"] as const;

export function slotLabel(slotId: string): string {
  const map: Record<string, string> = {
    lead1: "Руководитель 1",
    lead2: "Руководитель 2",
    "admin-manager": "Менеджер (под админом)",
    "m1-1": "Менеджер 1.1",
    "m1-2": "Менеджер 1.2",
    "m2-1": "Менеджер 2.1",
    "m2-2": "Менеджер 2.2",
  };
  if (map[slotId]) return map[slotId];
  const m = slotId.match(/^m(\d)-(\d+)$/);
  if (m) return `Менеджер ${m[1]}.${m[2]}`;
  return slotId;
}

export type OrgAssignments = Record<string, string | null>;

export function loadAssignments(): OrgAssignments {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(ORG_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string | null>;
    return { ...parsed };
  } catch {
    return {};
  }
}

export function saveAssignments(assignments: OrgAssignments) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ORG_STORAGE_KEY, JSON.stringify(assignments));
  } catch {
    /* ignore */
  }
}

/** Returns the slot label for an employee id, or null if not assigned. */
export function getSlotLabelForEmployee(assignments: OrgAssignments, employeeId: string): string | null {
  const slotId = Object.entries(assignments).find(([, id]) => id === employeeId)?.[0];
  return slotId ? slotLabel(slotId) : null;
}

export function loadExtraSlots(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(EXTRA_SLOTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveExtraSlots(slots: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EXTRA_SLOTS_KEY, JSON.stringify(slots));
  } catch {
    /* ignore */
  }
}

function nextExtraSlotId(extraSlotIds: string[], underLead: "lead1" | "lead2"): string {
  const prefix = underLead === "lead1" ? "m1-" : "m2-";
  const existing = extraSlotIds.filter((id) => id.startsWith(prefix));
  const maxNum = existing.length
    ? Math.max(...existing.map((id) => parseInt(id.replace(prefix, ""), 10)))
    : 2;
  return `${prefix}${maxNum + 1}`;
}

const nodeTypes: NodeTypes = { orgNode: OrgChartNode as NodeTypes[string] };

function buildNodesFromEmployees(
  employees: Employee[],
  assignments: OrgAssignments,
  extraSlotIds: string[],
  regionAssignments: RegionAssignments
): Node<OrgNodeData>[] {
  const admins = employees.filter((e) => e.role === "ADMIN");
  const byId = new Map(employees.map((e) => [e.id, e]));
  const get = (id: string | null) => (id ? byId.get(id) : undefined);

  const adminLabel =
    admins.length > 0
      ? admins.map((a) => a.fullName?.trim() || a.email).join(", ")
      : "Админы";
  const adminSubtitle =
    admins.length > 0 ? "Управление системой" : "Нет назначенных";

  const slot = (e: Employee | undefined, fallback: string) =>
    e ? (e.fullName?.trim() || e.email) : fallback;
  const regions = (slotId: string) => regionAssignments[slotId] ?? [];

  const lead1 = get(assignments.lead1 ?? null);
  const lead2 = get(assignments.lead2 ?? null);
  const adminManager = get(assignments["admin-manager"] ?? null);

  const baseNodes: Node<OrgNodeData>[] = [
    {
      id: "admins",
      type: "orgNode",
      position: { x: 340, y: 0 },
      data: {
        label: adminLabel,
        role: "admin",
        subtitle: adminSubtitle,
      },
    },
    {
      id: "lead1",
      type: "orgNode",
      position: { x: 80, y: 140 },
      data: {
        label: slot(lead1, "Руководитель 1"),
        role: "lead",
        subtitle: lead1 ? lead1.email : "Отдел продаж",
        regions: regions("lead1"),
      },
    },
    {
      id: "admin-manager",
      type: "orgNode",
      position: { x: 340, y: 140 },
      data: {
        label: slot(adminManager, "Менеджер (под админом)"),
        role: "manager",
        subtitle: adminManager ? adminManager.email : "Подчиняется админу",
        regions: regions("admin-manager"),
      },
    },
    {
      id: "lead2",
      type: "orgNode",
      position: { x: 600, y: 140 },
      data: {
        label: slot(lead2, "Руководитель 2"),
        role: "lead",
        subtitle: lead2 ? lead2.email : "Отдел продаж",
        regions: regions("lead2"),
      },
    },
    {
      id: "m1-1",
      type: "orgNode",
      position: { x: 0, y: 280 },
      data: {
        label: slot(get(assignments["m1-1"] ?? null), "Менеджер 1.1"),
        role: "manager",
        subtitle: get(assignments["m1-1"] ?? null)?.email,
        regions: regions("m1-1"),
      },
    },
    {
      id: "m1-2",
      type: "orgNode",
      position: { x: 240, y: 280 },
      data: {
        label: slot(get(assignments["m1-2"] ?? null), "Менеджер 1.2"),
        role: "manager",
        subtitle: get(assignments["m1-2"] ?? null)?.email,
        regions: regions("m1-2"),
      },
    },
    {
      id: "m2-1",
      type: "orgNode",
      position: { x: 440, y: 280 },
      data: {
        label: slot(get(assignments["m2-1"] ?? null), "Менеджер 2.1"),
        role: "manager",
        subtitle: get(assignments["m2-1"] ?? null)?.email,
        regions: regions("m2-1"),
      },
    },
    {
      id: "m2-2",
      type: "orgNode",
      position: { x: 680, y: 280 },
      data: {
        label: slot(get(assignments["m2-2"] ?? null), "Менеджер 2.2"),
        role: "manager",
        subtitle: get(assignments["m2-2"] ?? null)?.email,
        regions: regions("m2-2"),
      },
    },
  ];

  const lead1Extras = extraSlotIds.filter((id) => id.startsWith("m1-")).sort();
  const lead2Extras = extraSlotIds.filter((id) => id.startsWith("m2-")).sort();
  const lead1ExtraNodes: Node<OrgNodeData>[] = lead1Extras.map((slotId, i) => {
    const emp = get(assignments[slotId] ?? null);
    return {
      id: slotId,
      type: "orgNode",
      position: { x: 480 + 240 * i, y: 280 },
      data: {
        label: slot(emp, slotLabel(slotId)),
        role: "manager",
        subtitle: emp?.email,
        regions: regions(slotId),
      },
    };
  });
  const lead2ExtraNodes: Node<OrgNodeData>[] = lead2Extras.map((slotId, i) => {
    const emp = get(assignments[slotId] ?? null);
    return {
      id: slotId,
      type: "orgNode",
      position: { x: 680 + 240 * (i + 1), y: 280 },
      data: {
        label: slot(emp, slotLabel(slotId)),
        role: "manager",
        subtitle: emp?.email,
        regions: regions(slotId),
      },
    };
  });

  return [...baseNodes, ...lead1ExtraNodes, ...lead2ExtraNodes];
}

function buildEdges(extraSlotIds: string[]): Edge[] {
  const base: Edge[] = [
    { id: "e-admins-lead1", source: "admins", target: "lead1" },
    { id: "e-admins-lead2", source: "admins", target: "lead2" },
    { id: "e-admins-admin-manager", source: "admins", target: "admin-manager" },
    { id: "e-lead1-m11", source: "lead1", target: "m1-1" },
    { id: "e-lead1-m12", source: "lead1", target: "m1-2" },
    { id: "e-lead2-m21", source: "lead2", target: "m2-1" },
    { id: "e-lead2-m22", source: "lead2", target: "m2-2" },
  ];
  const extra = extraSlotIds.map((slotId) => ({
    id: `e-${slotId}`,
    source: slotId.startsWith("m1-") ? "lead1" : "lead2",
    target: slotId,
  }));
  return [...base, ...extra];
}

const defaultEdgeOptions = { type: "smoothstep" as const };

/** Кнопка выравнивания — должна рендериться внутри ReactFlow (использует useReactFlow). */
function FitViewButton() {
  const { fitView } = useReactFlow();
  const handleClick = useCallback(() => {
    fitView({ padding: 0.2, duration: 200 }).catch(() => {});
  }, [fitView]);
  return (
    <button
      type="button"
      onClick={handleClick}
      className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50"
    >
      Выровнять структуру
    </button>
  );
}

type OrgChartFlowProps = {
  employees: Employee[];
  assignments: OrgAssignments;
  regionAssignments: RegionAssignments;
  extraSlotIds: string[];
  onAssignmentChange: (slotId: string, employeeId: string | null) => void;
  onRegionsChange: (slotId: string, regions: string[]) => void;
  onExtraSlotsChange: (slotIds: string[]) => void;
  onRemoveSlot?: (slotId: string) => void;
  onSaveStructure?: () => void | Promise<void>;
  isSavingStructure?: boolean;
};

function isAssignableSlot(slotId: string, extraSlotIds: string[]): boolean {
  if (BASE_MANAGER_SLOTS.includes(slotId as (typeof BASE_MANAGER_SLOTS)[number])) return true;
  return extraSlotIds.includes(slotId);
}

export function OrgChartFlow({
  employees,
  assignments,
  regionAssignments,
  extraSlotIds,
  onAssignmentChange,
  onRegionsChange,
  onExtraSlotsChange,
  onRemoveSlot,
  onSaveStructure,
  isSavingStructure = false,
}: OrgChartFlowProps) {
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [regionsDropdownOpen, setRegionsDropdownOpen] = useState(false);
  const initialNodes = useMemo(
    () => buildNodesFromEmployees(employees, assignments, extraSlotIds, regionAssignments),
    [employees, assignments, extraSlotIds, regionAssignments]
  );
  const initialEdges = useMemo(
    () => buildEdges(extraSlotIds).map((e) => ({ ...e, ...defaultEdgeOptions })),
    [extraSlotIds]
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setRegionsDropdownOpen(false);
  }, [selectedSlotId]);

  useEffect(() => {
    setNodes(buildNodesFromEmployees(employees, assignments, extraSlotIds, regionAssignments));
    setEdges(buildEdges(extraSlotIds).map((e) => ({ ...e, ...defaultEdgeOptions })));
  }, [employees, assignments, extraSlotIds, regionAssignments, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback(
    (_e: React.MouseEvent, node: Node) => {
      if (isAssignableSlot(node.id, extraSlotIds)) {
        setSelectedSlotId(node.id);
      }
    },
    [extraSlotIds]
  );

  const handleAssignmentChange = useCallback(
    (slotId: string, employeeId: string | null) => {
      onAssignmentChange(slotId, employeeId);
      setSelectedSlotId(null);
    },
    [onAssignmentChange]
  );

  const addManagerUnder = useCallback(
    (underLead: "lead1" | "lead2") => {
      const nextId = nextExtraSlotId(extraSlotIds, underLead);
      onExtraSlotsChange([...extraSlotIds, nextId]);
      onAssignmentChange(nextId, null);
      setAddMenuOpen(false);
    },
    [extraSlotIds, onExtraSlotsChange, onAssignmentChange]
  );

  const removeExtraSlot = useCallback(
    (slotId: string) => {
      onExtraSlotsChange(extraSlotIds.filter((id) => id !== slotId));
      onRemoveSlot?.(slotId);
      setSelectedSlotId(null);
    },
    [extraSlotIds, onExtraSlotsChange, onRemoveSlot]
  );

  const isExtraSlot = selectedSlotId !== null && extraSlotIds.includes(selectedSlotId);

  return (
    <div className="relative w-full">
      <div className="h-[520px] w-full rounded-xl border border-zinc-200 bg-zinc-50/80">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.3}
          maxZoom={1.5}
        >
          <Background gap={16} size={1} color="rgb(228 228 231)" />
          <Controls className="!rounded-lg !border-zinc-200 !bg-white !shadow" />
          <MiniMap
            className="!rounded-lg !border-zinc-200 !bg-white"
            nodeColor={(n) => {
              const d = n.data as OrgNodeData;
              if (d.role === "admin") return "rgb(139 92 246)";
              if (d.role === "lead") return "rgb(245 158 11)";
              return "rgb(16 185 129)";
            }}
          />
<Panel position="top-left" className="flex flex-col gap-2 rounded-lg bg-white/90 px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm backdrop-blur">
          <span>Структура отдела продаж</span>
          <span className="block text-xs font-normal text-zinc-500">
            Клик по позиции — назначить сотрудника
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <FitViewButton />
            {onSaveStructure && (
              <button
                type="button"
                onClick={() => void onSaveStructure()}
                disabled={isSavingStructure}
                className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
              >
                {isSavingStructure ? "Сохранение…" : "Сохранить структуру"}
              </button>
            )}
            <div className="relative">
              <button
                type="button"
                onClick={() => setAddMenuOpen((o) => !o)}
                className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50"
              >
                + Добавить менеджера
              </button>
            {addMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-0"
                  aria-hidden
                  onClick={() => setAddMenuOpen(false)}
                />
                <div className="absolute left-0 top-full z-10 mt-1 w-56 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => addManagerUnder("lead1")}
                    className="w-full px-3 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-50"
                  >
                    Под Руководителем 1
                  </button>
                  <button
                    type="button"
                    onClick={() => addManagerUnder("lead2")}
                    className="w-full px-3 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-50"
                  >
                    Под Руководителем 2
                  </button>
                </div>
              </>
            )}
            </div>
          </div>
        </Panel>
        </ReactFlow>
      </div>

      {selectedSlotId && (
        <div className="absolute right-0 top-0 z-10 w-72 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg">
          <div className="mb-2 text-sm font-medium text-zinc-700">
            Назначить на позицию: {slotLabel(selectedSlotId)}
          </div>
          <select
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={assignments[selectedSlotId] ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              handleAssignmentChange(selectedSlotId, v ? v : null);
            }}
            autoFocus
          >
            <option value="">— Не назначен</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.fullName?.trim() || emp.email}
              </option>
            ))}
          </select>
          <label className="mt-3 block text-xs font-medium text-zinc-600">
            Области
          </label>
          <div className="relative mt-1">
            <button
              type="button"
              onClick={() => setRegionsDropdownOpen((o) => !o)}
              className="flex w-full items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-sm outline-none focus:border-zinc-400"
            >
              <span className="truncate text-zinc-700">
                {(regionAssignments[selectedSlotId] ?? []).length > 0
                  ? (regionAssignments[selectedSlotId] ?? []).join(", ")
                  : "Выберите области…"}
              </span>
              <span className="ml-2 shrink-0 text-zinc-400" aria-hidden>
                {regionsDropdownOpen ? "▴" : "▾"}
              </span>
            </button>
            {regionsDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-0"
                  aria-hidden
                  onClick={() => setRegionsDropdownOpen(false)}
                />
                <div className="absolute left-0 top-full z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
                  {(() => {
                    const selected = new Set(regionAssignments[selectedSlotId] ?? []);
                    const list = [...ORG_REGIONS_LIST];
                    selected.forEach((r) => {
                      if (!ORG_REGIONS_LIST.includes(r)) list.push(r);
                    });
                    return list.map((region) => (
                      <label
                        key={region}
                        className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-zinc-50"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(region)}
                          onChange={(e) => {
                            const next = new Set(regionAssignments[selectedSlotId] ?? []);
                            if (e.target.checked) next.add(region);
                            else next.delete(region);
                            onRegionsChange(selectedSlotId, [...next]);
                          }}
                          className="h-4 w-4 rounded border-zinc-300 text-zinc-700 focus:ring-zinc-400"
                        />
                        <span className="text-zinc-800">{region}</span>
                      </label>
                    ));
                  })()}
                </div>
              </>
            )}
          </div>
          {isExtraSlot && (
            <button
              type="button"
              onClick={() => removeExtraSlot(selectedSlotId)}
              className="mt-2 w-full rounded-lg border border-red-200 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              Удалить позицию
            </button>
          )}
          <button
            type="button"
            className="mt-3 w-full rounded-lg border border-zinc-200 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
            onClick={() => setSelectedSlotId(null)}
          >
            Закрыть
          </button>
        </div>
      )}
    </div>
  );
}
