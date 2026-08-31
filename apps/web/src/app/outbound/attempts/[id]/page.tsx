"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, CheckCircle, RefreshCw } from "lucide-react";
import {
  outboundApi,
  entityDisplayName,
  formatOutcomeKey,
  type OutboundAttempt,
  type OutboundOutcomeAnalysis,
  type OutboundScenario,
} from "@/lib/api/resources/outbound";
import { OutboundStatusBadge } from "../../_components/OutboundStatusBadge";
import { OutcomeBadge } from "../../_components/OutcomeBadge";
import { formatDateTime } from "@/lib/crmDatetime";
import { leadStatusLabel, outboundPipelineStepLabel, outboundTargetTypeLabel } from "@/lib/status-labels";

function formatDate(d: string | null | undefined) {
  return formatDateTime(d);
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-8 items-start gap-3 py-1.5">
      <dt className="w-36 shrink-0 text-xs font-medium text-zinc-500">{label}</dt>
      <dd className="flex-1 text-sm text-zinc-800">{children}</dd>
    </div>
  );
}

function AnalysisSection({ analysis }: { analysis: OutboundOutcomeAnalysis }) {
  const sourceLabels: Record<OutboundOutcomeAnalysis["analysisSource"], string> = {
    WEBHOOK_ONLY: "Webhook only",
    AI_SUPPLEMENT: "AI (supplement)",
    AI_CLASSIFY: "AI (classify)",
    INTERNAL_STUB: "Internal stub",
  };
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <div className="border-b border-zinc-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-700">Analysis</h2>
      </div>
      <div className="divide-y divide-zinc-100 px-4">
        <MetaRow label="Source">
          <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs">
            {sourceLabels[analysis.analysisSource] ?? analysis.analysisSource}
          </span>
        </MetaRow>
        <MetaRow label="Потребує перевірки">
          {analysis.needsReview ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
              ⚠ Yes — manual review needed
            </span>
          ) : (
            <span className="text-xs text-emerald-600">✓ OK</span>
          )}
        </MetaRow>
        {analysis.aiConfidence !== null && analysis.aiConfidence !== undefined && (
          <MetaRow label="AI confidence">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-200">
                <div
                  className="h-full rounded-full bg-blue-500"
                  style={{ width: `${Math.round(analysis.aiConfidence * 100)}%` }}
                />
              </div>
              <span className="text-xs text-zinc-500">
                {Math.round(analysis.aiConfidence * 100)}%
              </span>
            </div>
          </MetaRow>
        )}
      </div>
    </div>
  );
}

function ExtractedFields({ fields }: { fields: Record<string, unknown> }) {
  const entries = Object.entries(fields).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (entries.length === 0) return <p className="text-sm text-zinc-400">No extracted fields.</p>;
  return (
    <dl className="divide-y divide-zinc-100">
      {entries.map(([k, v]) => (
        <div key={k} className="flex min-h-8 items-start gap-3 py-1.5">
          <dt className="w-40 shrink-0 text-xs font-medium text-zinc-500">
            {k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}
          </dt>
          <dd className="flex-1 text-sm text-zinc-800">{String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

type ReviewMode = "idle" | "override" | "note" | "task";

function ReviewActionsPanel({
  attempt,
  scenarios,
  onUpdated,
}: {
  attempt: OutboundAttempt;
  scenarios: OutboundScenario[];
  onUpdated: (updated: OutboundAttempt) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ReviewMode>("idle");

  // Override outcome state
  const [overrideKey, setOverrideKey] = useState("");

  // Manager note state
  const [noteText, setNoteText] = useState(
    (attempt.outcome as { managerNote?: string } | null)?.managerNote ?? "",
  );

  // Task creation state
  const [taskTitle, setTaskTitle] = useState(
    `Follow-up: ${entityDisplayName(attempt)} (AI call)`
  );
  const [taskDueAt, setTaskDueAt] = useState("");

  const scenarioDef = scenarios.find((s) => s.code === attempt.scenarioCode);
  const outcomeMappings = scenarioDef?.outcomeMappings ?? [];
  const analysis = attempt.outcome?.analysis;
  const alreadyReviewed = analysis && !analysis.needsReview;

  async function doReview(extra: { overrideOutcomeKey?: string; managerNote?: string } = {}) {
    setBusy(true);
    setError(null);
    try {
      const updated = await outboundApi.reviewAttempt(attempt.id, {
        markReviewed: true,
        ...extra,
      });
      onUpdated(updated);
      setMode("idle");
    } catch (e) {
      setError(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          (e instanceof Error ? e.message : "Action failed"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveNote() {
    setBusy(true);
    setError(null);
    try {
      const updated = await outboundApi.reviewAttempt(attempt.id, {
        managerNote: noteText,
      });
      onUpdated(updated);
      setMode("idle");
    } catch (e) {
      setError(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          (e instanceof Error ? e.message : "Не вдалося зберегти нотатку"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function createTask() {
    if (!taskTitle.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: taskTitle.trim(),
          dueAt: taskDueAt || null,
          leadId: attempt.leadId ?? null,
          contactId: attempt.contactId ?? null,
          companyId: attempt.companyId ?? null,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message || `HTTP ${res.status}`);
      }
      setMode("idle");
      setTaskTitle("");
      setTaskDueAt("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося створити задачу");
    } finally {
      setBusy(false);
    }
  }

  const managerNote = (attempt.outcome as { managerNote?: string } | null)?.managerNote;

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <div className="border-b border-zinc-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-700">Review actions</h2>
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Manager note display */}
      {managerNote && mode !== "note" && (
        <div className="mx-4 mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
          <p className="mb-1 text-xs font-medium text-zinc-500">Manager note</p>
          <p className="text-xs text-zinc-700">{managerNote}</p>
        </div>
      )}

      <div className="space-y-2 p-4">
        {mode === "idle" && (
          <>
            {/* Mark as reviewed */}
            {analysis?.needsReview && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void doReview()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
              >
                <CheckCircle className="h-4 w-4" />
                Mark as reviewed
              </button>
            )}
            {alreadyReviewed && (
              <div className="flex items-center gap-1.5 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                <CheckCircle className="h-3.5 w-3.5" />
                Reviewed
              </div>
            )}
            {/* Override outcome */}
            {outcomeMappings.length > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setMode("override")}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                Override outcome
              </button>
            )}
            {/* Add / edit note */}
            <button
              type="button"
              disabled={busy}
              onClick={() => setMode("note")}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              {managerNote ? "Edit note" : "Add manager note"}
            </button>
            {/* Create follow-up task */}
            {(attempt.leadId || attempt.contactId) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setMode("task")}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                Create follow-up task
              </button>
            )}
          </>
        )}

        {mode === "override" && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-zinc-600">Select new outcome:</p>
            <select
              value={overrideKey}
              onChange={(e) => setOverrideKey(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            >
              <option value="">— select outcome —</option>
              {outcomeMappings.map((m) => (
                <option key={m.outcomeKey} value={m.outcomeKey}>
                  {formatOutcomeKey(m.outcomeKey)} ({m.bucket})
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || !overrideKey}
                onClick={() => void doReview({ overrideOutcomeKey: overrideKey })}
                className="flex-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                {busy ? <RefreshCw className="mx-auto h-4 w-4 animate-spin" /> : "Застосувати override"}
              </button>
              <button
                type="button"
                onClick={() => setMode("idle")}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {mode === "note" && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-zinc-600">Manager note:</p>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={4}
              placeholder="Internal note about this attempt…"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveNote()}
                className="flex-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                {busy ? <RefreshCw className="mx-auto h-4 w-4 animate-spin" /> : "Зберегти нотатку"}
              </button>
              <button
                type="button"
                onClick={() => setMode("idle")}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {mode === "task" && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-zinc-600">Create follow-up task:</p>
            <input
              type="text"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="Task title"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <input
              type="datetime-local"
              value={taskDueAt}
              onChange={(e) => setTaskDueAt(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || !taskTitle.trim()}
                onClick={() => void createTask()}
                className="flex-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
              >
                {busy ? <RefreshCw className="mx-auto h-4 w-4 animate-spin" /> : "Створити завдання"}
              </button>
              <button
                type="button"
                onClick={() => setMode("idle")}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AttemptDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [attempt, setAttempt] = useState<OutboundAttempt | null>(null);
  const [scenarios, setScenarios] = useState<OutboundScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    Promise.all([outboundApi.getAttempt(id), outboundApi.listScenarios()])
      .then(([a, s]) => {
        setAttempt(a);
        setScenarios(s);
      })
      .catch((e) => {
        setError(
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
            (e instanceof Error ? e.message : "Не вдалося завантажити спробу"),
        );
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="py-20 text-center text-zinc-400">Loading attempt…</div>
    );
  }

  if (error || !attempt) {
    return (
      <div className="py-12 text-center">
        <p className="font-medium text-red-600">{error ?? "Attempt not found"}</p>
        <button
          type="button"
          onClick={() => router.back()}
          className="mt-4 text-sm text-zinc-500 hover:text-zinc-800"
        >
          ← Go back
        </button>
      </div>
    );
  }

  const outcome = attempt.outcome;
  const analysis = outcome?.analysis;
  const entityName = entityDisplayName(attempt);

  return (
    <div className="space-y-4">
      {/* Back + breadcrumb */}
      <div className="flex items-center gap-2">
        <Link
          href="/outbound/attempts"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800"
        >
          <ChevronLeft className="h-4 w-4" />
          Attempts
        </Link>
        <span className="text-zinc-300">/</span>
        <span className="text-sm text-zinc-700">{attempt.id.slice(-8)}</span>
      </div>

      {/* Header strip */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="flex flex-wrap items-start gap-4 px-5 py-4">
          <div className="flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Attempt
            </p>
            <h2 className="mt-0.5 text-lg font-semibold text-zinc-900">{entityName}</h2>
            <p className="mt-0.5 text-sm text-zinc-500">{attempt.phoneNormalized}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <OutboundStatusBadge status={attempt.status} />
            {outcome && (
              <OutcomeBadge outcomeKey={outcome.outcomeKey} bucket={outcome.bucket} />
            )}
            {analysis?.needsReview && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                ⚠ Review needed
              </span>
            )}
            {!attempt.callId && attempt.status === "COMPLETED" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-xs text-zinc-500">
                ⊘ No call linked
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left column: metadata + entity */}
        <div className="space-y-4 lg:col-span-2">
          {/* Core metadata */}
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-zinc-700">Деталі</h2>
            </div>
            <dl className="divide-y divide-zinc-100 px-4">
              <MetaRow label="Кампанія">{attempt.campaign?.name ?? attempt.campaignId}</MetaRow>
              <MetaRow label="Сценарій">
                <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                  {attempt.scenarioCode}
                </span>
                <span className="ml-1.5 text-xs text-zinc-400">v{attempt.scenarioVersion}</span>
              </MetaRow>
              <MetaRow label="Тип цілі">{outboundTargetTypeLabel(attempt.targetType)}</MetaRow>
              <MetaRow label="Телефон">{attempt.phoneNormalized}</MetaRow>
              <MetaRow label="Провайдер runtime">
                {attempt.runtimeProvider ?? attempt.provider ?? "—"}
              </MetaRow>
              <MetaRow label="Сесія провайдера">
                {attempt.providerSessionId ? (
                  <code className="break-all rounded bg-zinc-100 px-1 py-0.5 text-xs">
                    {attempt.providerSessionId}
                  </code>
                ) : (
                  "—"
                )}
              </MetaRow>
              {attempt.externalSessionId && (
                <MetaRow label="Зовнішня сесія">
                  <code className="break-all rounded bg-zinc-100 px-1 py-0.5 text-xs">
                    {attempt.externalSessionId}
                  </code>
                </MetaRow>
              )}
              {(attempt.providerCallId || attempt.openaiCallId || attempt.recordingExternalId) && (
                <MetaRow label="Provider / OpenAI / recording id">
                  <span className="space-y-1 text-xs">
                    {attempt.providerCallId && (
                      <div>
                        <span className="text-zinc-400">Provider call:</span>{" "}
                        <code className="rounded bg-zinc-100 px-1">{attempt.providerCallId}</code>
                      </div>
                    )}
                    {attempt.openaiCallId && (
                      <div>
                        <span className="text-zinc-400">OpenAI:</span>{" "}
                        <code className="rounded bg-zinc-100 px-1">{attempt.openaiCallId}</code>
                      </div>
                    )}
                    {attempt.recordingExternalId && (
                      <div>
                        <span className="text-zinc-400">Recording:</span>{" "}
                        <code className="rounded bg-zinc-100 px-1">{attempt.recordingExternalId}</code>
                      </div>
                    )}
                  </span>
                </MetaRow>
              )}
              {(attempt.transcriptStatus ||
                attempt.summaryStatus ||
                attempt.classificationStatus ||
                attempt.transferStatus) && (
                <MetaRow label="Статус пайплайну">
                  <span className="text-xs text-zinc-600">
                    {[
                      attempt.transcriptStatus &&
                        `транскрипт: ${outboundPipelineStepLabel(attempt.transcriptStatus)}`,
                      attempt.summaryStatus &&
                        `підсумок: ${outboundPipelineStepLabel(attempt.summaryStatus)}`,
                      attempt.classificationStatus &&
                        `класифікація: ${outboundPipelineStepLabel(attempt.classificationStatus)}`,
                      attempt.transferStatus &&
                        `трансфер: ${outboundPipelineStepLabel(attempt.transferStatus)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </MetaRow>
              )}
              {attempt.catalogSentAt && (
                <MetaRow label="Каталог надіслано">{formatDate(attempt.catalogSentAt)}</MetaRow>
              )}
              {(attempt.lastRuntimeEventAt || attempt.lastRuntimeEventType) && (
                <MetaRow label="Остання runtime-подія">
                  <span className="text-xs">
                    {attempt.lastRuntimeEventType ?? "—"}{" "}
                    {attempt.lastRuntimeEventAt ? `· ${formatDate(attempt.lastRuntimeEventAt)}` : ""}
                  </span>
                </MetaRow>
              )}
              {(attempt.failureCode || attempt.failureReason) && (
                <MetaRow label="Помилка">
                  <span className="text-xs text-red-700">
                    {attempt.failureCode ?? ""}
                    {attempt.failureReason ? ` — ${attempt.failureReason}` : ""}
                  </span>
                </MetaRow>
              )}
              <MetaRow label="Звʼязаний дзвінок">
                {attempt.callId ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs">
                      {attempt.callId}
                    </code>
                    {attempt.call && (
                      <span className="text-xs text-zinc-400">
                        · {attempt.call.provider} · {attempt.call.externalId}
                        {attempt.call.durationSec != null
                          ? ` · ${attempt.call.durationSec}s`
                          : ""}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-zinc-400">Not linked</span>
                )}
              </MetaRow>
              <MetaRow label="Scheduled">{formatDate(attempt.scheduledAt)}</MetaRow>
              <MetaRow label="Created">{formatDate(attempt.createdAt)}</MetaRow>
              <MetaRow label="Updated">{formatDate(attempt.updatedAt)}</MetaRow>
              {attempt.lastError && (
                <MetaRow label="Last error">
                  <span className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-700">
                    {attempt.lastError}
                  </span>
                </MetaRow>
              )}
            </dl>
          </div>

          {/* CRM entity */}
          {(attempt.lead || attempt.contact) && (
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
              <div className="border-b border-zinc-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-zinc-700">
                  {attempt.lead ? "Лід" : "Контакт"}
                </h2>
              </div>
              <dl className="divide-y divide-zinc-100 px-4">
                {attempt.lead && (
                  <>
                    <MetaRow label="Імʼя">
                      <Link
                        href={`/leads?leadId=${attempt.lead.id}`}
                        className="font-medium text-zinc-900 hover:underline"
                      >
                        {entityDisplayName(attempt)}
                      </Link>
                    </MetaRow>
                    <MetaRow label="Статус">
                      <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs">
                        {leadStatusLabel(attempt.lead.status)}
                      </span>
                    </MetaRow>
                    <MetaRow label="Джерело">
                      <span className="text-xs text-zinc-600">{attempt.lead.source}</span>
                    </MetaRow>
                    {attempt.lead.owner && (
                      <MetaRow label="Власник">{attempt.lead.owner.fullName}</MetaRow>
                    )}
                    {attempt.lead.message && (
                      <MetaRow label="Message">
                        <span className="text-xs text-zinc-600">{attempt.lead.message}</span>
                      </MetaRow>
                    )}
                  </>
                )}
                {attempt.contact && (
                  <>
                    <MetaRow label="Імʼя">
                      <Link
                        href={`/contacts?contactId=${attempt.contact.id}`}
                        className="font-medium text-zinc-900 hover:underline"
                      >
                        {entityDisplayName(attempt)}
                      </Link>
                    </MetaRow>
                    {attempt.contact.status && (
                      <MetaRow label="Статус">
                        <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs">
                          {attempt.contact.status}
                        </span>
                      </MetaRow>
                    )}
                    {attempt.contact.owner && (
                      <MetaRow label="Власник">{attempt.contact.owner.fullName}</MetaRow>
                    )}
                    {attempt.contact.email && (
                      <MetaRow label="Email">
                        <a
                          href={`mailto:${attempt.contact.email}`}
                          className="text-blue-600 hover:underline"
                        >
                          {attempt.contact.email}
                        </a>
                      </MetaRow>
                    )}
                  </>
                )}
              </dl>
            </div>
          )}

          {/* Summary */}
          {attempt.summary && (
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
              <div className="border-b border-zinc-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-zinc-700">Summary</h2>
              </div>
              <p className="px-4 py-3 text-sm text-zinc-700 leading-relaxed">
                {attempt.summary}
              </p>
            </div>
          )}

          {/* Extracted fields */}
          {outcome?.fields && Object.keys(outcome.fields).length > 0 && (
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
              <div className="border-b border-zinc-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-zinc-700">Extracted fields</h2>
              </div>
              <div className="px-4 py-2">
                <ExtractedFields fields={outcome.fields} />
              </div>
            </div>
          )}

          {/* Transcript */}
          {attempt.transcript && (
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-3 text-left"
                onClick={() => setTranscriptExpanded((v) => !v)}
              >
                <h2 className="text-sm font-semibold text-zinc-700">Transcript</h2>
                <span className="text-xs text-zinc-400">
                  {transcriptExpanded ? "Згорнути ▲" : "Розгорнути ▼"}
                </span>
              </button>
              {transcriptExpanded && (
                <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words px-4 pb-4 font-mono text-xs leading-relaxed text-zinc-700">
                  {attempt.transcript}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Right column: review actions + analysis + outcome + call */}
        <div className="space-y-4">
          {/* Review actions panel — always shown for completed attempts */}
          {attempt.status === "COMPLETED" && (
            <ReviewActionsPanel
              attempt={attempt}
              scenarios={scenarios}
              onUpdated={setAttempt}
            />
          )}

          {/* Outcome card */}
          {outcome && (
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
              <div className="border-b border-zinc-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-zinc-700">Outcome</h2>
              </div>
              <div className="px-4 py-3">
                <div className="mb-3">
                  <OutcomeBadge outcomeKey={outcome.outcomeKey} bucket={outcome.bucket} />
                </div>
                {outcome.bucket && (
                  <p className="text-xs text-zinc-400">
                    Bucket:{" "}
                    <span className="font-medium text-zinc-600">{outcome.bucket}</span>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Analysis */}
          {analysis && <AnalysisSection analysis={analysis} />}

          {/* Call info */}
          {attempt.call && (
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
              <div className="border-b border-zinc-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-zinc-700">Звʼязаний дзвінок</h2>
              </div>
              <dl className="divide-y divide-zinc-100 px-4">
                <MetaRow label="Провайдер">{attempt.call.provider}</MetaRow>
                <MetaRow label="External ID">
                  <code className="text-xs">{attempt.call.externalId}</code>
                </MetaRow>
                <MetaRow label="Напрямок">{attempt.call.direction}</MetaRow>
                <MetaRow label="Duration">
                  {attempt.call.durationSec != null
                    ? `${attempt.call.durationSec}s`
                    : "—"}
                </MetaRow>
                <MetaRow label="Started">{formatDate(attempt.call.startedAt)}</MetaRow>
                {attempt.call.recordingUrl && (
                  <MetaRow label="Recording">
                    <a
                      href={attempt.call.recordingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Open recording ↗
                    </a>
                  </MetaRow>
                )}
              </dl>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
