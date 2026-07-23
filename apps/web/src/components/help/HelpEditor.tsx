"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { HelpMarkdown } from "@/components/help/HelpMarkdown";
import type { HelpArticleBinding, HelpArticleInput, HelpAudience, HelpArticleStatus } from "@/lib/api/resources/help";
import { strings } from "@/locales";

type HelpEditorProps = {
  value: HelpArticleInput;
  onChange: (next: HelpArticleInput) => void;
  categories: { key: string; title: string; audience: HelpAudience }[];
  showSeedReset?: boolean;
  onResetSeed?: () => void;
  footer?: ReactNode;
};

const ROLE_OPTIONS = ["ADMIN", "LEAD", "MANAGER", "WAREHOUSE", "USER"];

export function HelpEditor({
  value,
  onChange,
  categories,
  showSeedReset,
  onResetSeed,
  footer,
}: HelpEditorProps) {
  const t = strings.help;

  const patch = useCallback(
    (partial: Partial<HelpArticleInput>) => onChange({ ...value, ...partial }),
    [onChange, value],
  );

  const updateBinding = (index: number, partial: Partial<HelpArticleBinding>) => {
    const bindings = [...(value.bindings ?? [])];
    bindings[index] = { ...bindings[index], ...partial };
    patch({ bindings });
  };

  const addBinding = () => {
    patch({ bindings: [...(value.bindings ?? []), { routeKey: "", entityType: null, sortOrder: (value.bindings?.length ?? 0) * 10 }] });
  };

  const removeBinding = (index: number) => {
    patch({ bindings: (value.bindings ?? []).filter((_, i) => i !== index) });
  };

  const insertMarkdown = (before: string, after = "") => {
    const textarea = document.getElementById("help-body-md") as HTMLTextAreaElement | null;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.bodyMd.slice(start, end);
    const next = value.bodyMd.slice(0, start) + before + selected + after + value.bodyMd.slice(end);
    patch({ bodyMd: next });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700">{t.fieldTitle}</span>
          <input
            value={value.title}
            onChange={(e) => patch({ title: e.target.value })}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700">{t.fieldSlug}</span>
          <input
            value={value.slug ?? ""}
            onChange={(e) => patch({ slug: e.target.value })}
            placeholder={t.fieldSlugHint}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700">{t.fieldCategory}</span>
          <select
            value={value.categoryKey}
            onChange={(e) => patch({ categoryKey: e.target.value })}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          >
            {categories.map((cat) => (
              <option key={cat.key} value={cat.key}>
                {cat.title} ({cat.audience === "PRODUCT" ? "CRM" : "Бізнес"})
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700">{t.fieldAudience}</span>
          <select
            value={value.audience}
            onChange={(e) => patch({ audience: e.target.value as HelpAudience })}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          >
            <option value="PRODUCT">CRM (PRODUCT)</option>
            <option value="BUSINESS">Бізнес (BUSINESS)</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-zinc-700">{t.fieldStatus}</span>
          <select
            value={value.status ?? "DRAFT"}
            onChange={(e) => patch({ status: e.target.value as HelpArticleStatus })}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          >
            <option value="DRAFT">{t.statusDraft}</option>
            <option value="PUBLISHED">{t.statusPublished}</option>
          </select>
        </label>
        <label className="block md:col-span-2">
          <span className="mb-1 block text-sm font-medium text-zinc-700">{t.fieldExcerpt}</span>
          <input
            value={value.excerpt ?? ""}
            onChange={(e) => patch({ excerpt: e.target.value })}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-zinc-700">{t.fieldBody}</span>
          <button type="button" onClick={() => insertMarkdown("## ", "")} className="rounded bg-zinc-100 px-2 py-1 text-xs">
            H2
          </button>
          <button type="button" onClick={() => insertMarkdown("**", "**")} className="rounded bg-zinc-100 px-2 py-1 text-xs">
            Bold
          </button>
          <button type="button" onClick={() => insertMarkdown("- ", "")} className="rounded bg-zinc-100 px-2 py-1 text-xs">
            List
          </button>
          <button type="button" onClick={() => insertMarkdown("[", "](url)")} className="rounded bg-zinc-100 px-2 py-1 text-xs">
            Link
          </button>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <textarea
            id="help-body-md"
            value={value.bodyMd}
            onChange={(e) => patch({ bodyMd: e.target.value })}
            rows={18}
            className="w-full rounded-xl border border-zinc-200 px-3 py-2 font-mono text-sm"
          />
          <div className="max-h-[420px] overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <BookOpen className="h-3.5 w-3.5" />
              {t.preview}
            </div>
            <HelpMarkdown content={value.bodyMd || t.previewEmpty} />
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-700">{t.fieldBindings}</span>
          <button type="button" onClick={addBinding} className="text-sm font-medium text-blue-700 hover:underline">
            {t.addBinding}
          </button>
        </div>
        <div className="space-y-2">
          {(value.bindings ?? []).map((binding, index) => (
            <div key={index} className="grid gap-2 rounded-lg border border-zinc-200 p-3 md:grid-cols-[1fr_1fr_auto]">
              <input
                value={binding.routeKey ?? ""}
                onChange={(e) => updateBinding(index, { routeKey: e.target.value || null })}
                placeholder={t.bindingRouteKey}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
              <input
                value={binding.entityType ?? ""}
                onChange={(e) => updateBinding(index, { entityType: e.target.value || null })}
                placeholder={t.bindingEntityType}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
              <button type="button" onClick={() => removeBinding(index)} className="text-sm text-red-600 hover:underline">
                {strings.common.cancel}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <span className="mb-2 block text-sm font-medium text-zinc-700">{t.fieldVisibleRoles}</span>
        <div className="flex flex-wrap gap-3">
          {ROLE_OPTIONS.map((role) => {
            const selected = value.visibleRoles?.includes(role) ?? false;
            return (
              <label key={role} className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={(e) => {
                    const current = new Set(value.visibleRoles ?? []);
                    if (e.target.checked) current.add(role);
                    else current.delete(role);
                    patch({ visibleRoles: current.size ? Array.from(current) : null });
                  }}
                />
                {role}
              </label>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-zinc-500">{t.fieldVisibleRolesHint}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-4">
        {footer}
        {showSeedReset && onResetSeed ? (
          <button type="button" onClick={onResetSeed} className="text-sm font-medium text-amber-700 hover:underline">
            {t.resetSeed}
          </button>
        ) : null}
      </div>
    </div>
  );
}
