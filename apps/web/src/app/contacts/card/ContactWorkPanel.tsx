"use client";

import type { ContactInsightsResponse } from "@/lib/api/resources/contacts";
import { formatDate } from "@/lib/crmDatetime";
import { strings } from "@/locales";
import { formatContactClientStage } from "../contact-formatters";
import { ContactCrmHint } from "./ContactCrmHint";
import { getClientStageOptions, getNextActionOptions } from "./contact-card-options";
import type { ContactCardSummary } from "./useContactCardSummary";

const t = strings.contacts.card.work;

type Props = {
  summary: ContactCardSummary | null;
  insightsLoading: boolean;
  insightsError: string | null;
  insights: ContactInsightsResponse | null;
  clientStage: string;
  onClientStageChange: (v: string) => void;
  savingStage: boolean;
  stageError: string | null;
  stageSuccess: string | null;
  onSaveStage: () => void;
  nextActionType: string;
  nextActionAt: string;
  nextActionNote: string;
  onNextActionTypeChange: (v: string) => void;
  onNextActionAtChange: (v: string) => void;
  onNextActionNoteChange: (v: string) => void;
  savingNextAction: boolean;
  nextActionError: string | null;
  nextActionSuccess: string | null;
  onSaveNextAction: () => void;
};

export function ContactWorkPanel({
  summary,
  insightsLoading,
  insightsError,
  insights,
  clientStage,
  onClientStageChange,
  savingStage,
  stageError,
  stageSuccess,
  onSaveStage,
  nextActionType,
  nextActionAt,
  nextActionNote,
  onNextActionTypeChange,
  onNextActionAtChange,
  onNextActionNoteChange,
  savingNextAction,
  nextActionError,
  nextActionSuccess,
  onSaveNextAction,
}: Props) {
  const stageOptions = getClientStageOptions();
  const actionOptions = getNextActionOptions();
  const nextStep = summary?.insights.nextStep;
  const actionDisabled = !nextActionType || nextActionType === "NO_ACTION";

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{t.title}</div>

      <ContactCrmHint loading={insightsLoading} error={insightsError} insights={insights} />

      {nextStep ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-3 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{t.nextTask}</div>
          <div className="mt-1 text-zinc-800">
            {`${nextStep.title}${nextStep.dueAt ? ` · ${formatDate(nextStep.dueAt)}` : ""}`}
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border border-zinc-200 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{t.clientStage}</div>
          {stageSuccess ? <span className="text-xs text-emerald-700">{stageSuccess}</span> : null}
        </div>
        <div className="mt-2 text-sm text-zinc-800">
          {t.recommendedStage}:{" "}
          <span className="font-medium">
            {formatContactClientStage(insights?.suggestion.suggestedStage)}
          </span>
        </div>
        <label className="mt-3 block text-sm text-zinc-700">
          <span className="mb-1 block text-xs text-zinc-500">{t.clientStage}</span>
          <select
            value={clientStage}
            onChange={(e) => onClientStageChange(e.target.value)}
            disabled={savingStage}
            className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
          >
            {stageOptions.map((option) => (
              <option key={option.value || "empty"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {stageError ? (
          <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
            {stageError}
          </div>
        ) : null}
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onSaveStage}
            disabled={savingStage}
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {savingStage ? t.savingStage : t.saveStage}
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{t.nextAction}</div>
          {nextActionSuccess ? (
            <span className="text-xs text-emerald-700">{nextActionSuccess}</span>
          ) : null}
        </div>
        <div className="mt-3 grid gap-3">
          <label className="text-sm text-zinc-700">
            <span className="mb-1 block text-xs text-zinc-500">{t.action}</span>
            <select
              value={nextActionType}
              onChange={(e) => onNextActionTypeChange(e.target.value)}
              disabled={savingNextAction}
              className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            >
              {actionOptions.map((option) => (
                <option key={option.value || "empty"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-zinc-700">
            <span className="mb-1 block text-xs text-zinc-500">{t.when}</span>
            <input
              type="datetime-local"
              value={nextActionAt}
              onChange={(e) => onNextActionAtChange(e.target.value)}
              disabled={savingNextAction || actionDisabled}
              className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400 disabled:bg-zinc-50"
            />
          </label>
        </div>
        <label className="mt-3 block text-sm text-zinc-700">
          <span className="mb-1 block text-xs text-zinc-500">{t.note}</span>
          <textarea
            rows={2}
            value={nextActionNote}
            onChange={(e) => onNextActionNoteChange(e.target.value)}
            disabled={savingNextAction || actionDisabled}
            className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400 disabled:bg-zinc-50"
            placeholder={t.notePlaceholder}
          />
        </label>
        {nextActionError ? (
          <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
            {nextActionError}
          </div>
        ) : null}
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onSaveNextAction}
            disabled={savingNextAction}
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {savingNextAction ? t.savingAction : t.saveAction}
          </button>
        </div>
      </div>
    </div>
  );
}
