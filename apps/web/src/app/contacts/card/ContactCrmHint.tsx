import type { ContactInsightsResponse } from "@/lib/api/resources/contacts";
import {
  formatContactExclusionReason,
  formatContactNextActionType,
  formatContactPriorityReason,
} from "../contact-formatters";

function scoreTone(score: number) {
  if (score >= 70) return "bg-red-50 text-red-700 border-red-200";
  if (score >= 40) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-zinc-100 text-zinc-700 border-zinc-200";
}

type Props = {
  loading: boolean;
  error: string | null;
  insights: ContactInsightsResponse | null;
};

export function ContactCrmHint({ loading, error, insights }: Props) {
  if (loading) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-500">
        CRM-підказка завантажується...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        CRM-підказка тимчасово недоступна: {error}
      </div>
    );
  }

  if (!insights) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-500">
        CRM-підказка для цього контакту поки недоступна.
      </div>
    );
  }

  const excluded = insights.exclusions.excluded;
  const reasons = insights.priority.reasons;
  const topReasons = reasons.slice(0, 3);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">CRM-підказка</div>
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${scoreTone(
            insights.priority.score,
          )}`}
        >
          Бал {insights.priority.score}
        </span>
      </div>

      {excluded ? (
        <div className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-700">
          Виключено з активної черги:{" "}
          {insights.exclusions.reasons.map(formatContactExclusionReason).join(", ")}
        </div>
      ) : null}

      <div className="mt-2 text-sm text-zinc-800">
        Рекомендована наступна дія:{" "}
        <span className="font-medium">
          {formatContactNextActionType(insights.suggestion.suggestedNextActionType)}
        </span>
      </div>

      {topReasons.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {topReasons.map((reason) => (
            <span
              key={reason}
              className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-700"
            >
              {formatContactPriorityReason(reason)}
            </span>
          ))}
        </div>
      ) : (
        <div className="mt-2 text-xs text-zinc-500">Поки немає причин пріоритету.</div>
      )}
    </div>
  );
}
