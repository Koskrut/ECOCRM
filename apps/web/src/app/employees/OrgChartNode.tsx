"use client";

import { memo } from "react";
import { Handle, type NodeProps, Position } from "@xyflow/react";

export type OrgNodeData = {
  label: string;
  role: "admin" | "lead" | "manager";
  subtitle?: string;
  /** Закреплённые области (регионы) за позицией */
  regions?: string[];
};

const roleStyles = {
  admin: "border-violet-300 bg-violet-50 shadow-md shadow-violet-100",
  lead: "border-amber-300 bg-amber-50 shadow-md shadow-amber-100",
  manager: "border-emerald-300 bg-emerald-50 shadow-md shadow-emerald-100",
};

const roleLabels = {
  admin: "Админ",
  lead: "Руководитель отдела продаж",
  manager: "Менеджер",
};

function OrgChartNodeComponent({ data, selected }: NodeProps<OrgNodeData>) {
  const style = roleStyles[data.role ?? "manager"];
  const roleLabel = roleLabels[data.role ?? "manager"];

  return (
    <div
      className={`min-w-[180px] max-w-[240px] rounded-xl border-2 px-4 py-3 ${style} ${
        selected ? "ring-2 ring-zinc-400 ring-offset-2" : ""
      }`}
    >
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-2 !border-zinc-400 !bg-white" />
      <div className="min-w-0 text-center">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{roleLabel}</div>
        <div className="mt-0.5 truncate font-semibold text-zinc-900" title={data.label}>
          {data.label}
        </div>
        {data.regions && data.regions.length > 0 && (
          <div className="mt-1.5 flex min-w-0 flex-wrap justify-center gap-1">
            {data.regions.map((r) => (
              <span
                key={r}
                className="shrink-0 rounded bg-zinc-200/80 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700"
                title={r.trim()}
              >
                {r.trim().length > 12 ? `${r.trim().slice(0, 10)}…` : r.trim()}
              </span>
            ))}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-2 !border-zinc-400 !bg-white" />
    </div>
  );
}

export const OrgChartNode = memo(OrgChartNodeComponent);
