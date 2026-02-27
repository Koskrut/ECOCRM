// apps/web/src/app/orders/OrderStatusBar.tsx
"use client";

import React from "react";

export type OrderStatusId =
  | "NEW"
  | "IN_WORK"
  | "PROCESSING"
  | "READY_TO_SHIP"
  | "SHIPPED"
  | "PAYMENT_CONTROL"
  | "PAID"
  | "SUCCESS"
  | "RETURNING"
  | "CANCELED";

type StatusDef = {
  id: OrderStatusId;
  label: string;
  color: {
    bg: string; // tailwind bg-*
    border: string; // tailwind border-*
  };
};

const FLOW: StatusDef[] = [
  { id: "NEW", label: "Нова", color: { bg: "bg-sky-500", border: "border-sky-500" } },
  { id: "IN_WORK", label: "В роботу", color: { bg: "bg-indigo-500", border: "border-indigo-500" } },
  {
    id: "PROCESSING",
    label: "В обробці",
    color: { bg: "bg-violet-500", border: "border-violet-500" },
  },
  {
    id: "READY_TO_SHIP",
    label: "Готово до відпр...",
    color: { bg: "bg-amber-500", border: "border-amber-500" },
  },
  {
    id: "SHIPPED",
    label: "Відправленно",
    color: { bg: "bg-emerald-600", border: "border-emerald-600" },
  },
  {
    id: "PAYMENT_CONTROL",
    label: "Контроль оплати",
    color: { bg: "bg-yellow-500", border: "border-yellow-500" },
  },
  { id: "PAID", label: "Оплачено", color: { bg: "bg-lime-600", border: "border-lime-600" } },
  {
    id: "SUCCESS",
    label: "Завершити угоду",
    color: { bg: "bg-green-700", border: "border-green-700" },
  },
];

// Если статус не в FLOW — считаем как NEW
function idxOf(status: string) {
  const i = FLOW.findIndex((s) => s.id === status);
  return i >= 0 ? i : 0;
}

export function OrderStatusBar(props: {
  value: string; // текущий статус
  disabled?: boolean;
  className?: string;

  // Если хочешь кликабельные статусы:
  onChange?: (next: OrderStatusId) => void;

  // Можно блокировать отдельные шаги + показывать reason в title
  canGoTo?: (next: OrderStatusId) => { ok: boolean; reason?: string };
}) {
  const { value, disabled, className, onChange, canGoTo } = props;

  const activeIdx = idxOf(value);

  return (
    <div className={["w-full overflow-x-auto", className || ""].join(" ")}>
      <div className="flex min-w-max gap-2">
        {FLOW.map((s, i) => {
          const _isDone = i < activeIdx; // пройденный
          const isActive = i === activeIdx; // текущий
          const isFuture = i > activeIdx; // не пройденный

          const clickable = typeof onChange === "function" && !disabled;
          const check = canGoTo?.(s.id) ?? { ok: true };
          const blocked = clickable && !check.ok;

          // БАЗА: не пройденный — серый
          const base =
            "relative h-10 px-4 rounded-md border text-sm font-medium whitespace-nowrap transition";

          const grayStyle = "bg-zinc-200 border-zinc-200 text-zinc-700 hover:bg-zinc-300";

          // Пройденный/активный — заливка цветом
          const coloredStyle = [s.color.bg, s.color.border, "text-white", "hover:opacity-90"].join(
            " ",
          );

          // Итоговый стиль
          const cls = [
            base,
            isFuture ? grayStyle : coloredStyle, // 👈 ключевое правило
            clickable ? "cursor-pointer" : "cursor-default",
            disabled ? "opacity-70" : "",
            blocked ? "opacity-50 cursor-not-allowed hover:opacity-50" : "",
          ].join(" ");

          const Tag: unknown = clickable ? "button" : "div";

          return (
            <Tag
              key={s.id}
              type={clickable ? "button" : undefined}
              className={cls}
              title={blocked ? check.reason || "Недоступно" : s.label}
              disabled={clickable ? blocked : undefined}
              onClick={
                clickable && !blocked
                  ? () => {
                      if (s.id !== value) onChange?.(s.id);
                    }
                  : undefined
              }
            >
              {s.label}

              {/* стрелка у текущего, как на битриксе */}
              {isActive ? (
                <span
                  className={[
                    "absolute -right-2 top-1/2 -translate-y-1/2 w-0 h-0",
                    "border-t-[10px] border-b-[10px] border-l-[10px]",
                    "border-t-transparent border-b-transparent",
                    // цвет стрелки = цвет статуса
                    isFuture ? "border-l-zinc-200" : s.color.border.replace("border-", "border-l-"),
                  ].join(" ")}
                />
              ) : null}
            </Tag>
          );
        })}
      </div>
    </div>
  );
}
