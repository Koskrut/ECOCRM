"use client";

type InboxStatus = "OPEN" | "PENDING" | "CLOSED";

const ACTIONS: Array<{ status: InboxStatus; label: string }> = [
  { status: "OPEN", label: "В роботі" },
  { status: "PENDING", label: "Очікує відповіді" },
  { status: "CLOSED", label: "Закрити" },
];

type Props = {
  value: InboxStatus;
  onChange: (status: InboxStatus) => void;
  disabled?: boolean;
};

export function InboxStatusActions({ value, onChange, disabled }: Props) {
  return (
    <div className="mt-1 flex flex-wrap gap-1.5">
      {ACTIONS.map(({ status, label }) => (
        <button
          key={status}
          type="button"
          disabled={disabled}
          onClick={() => onChange(status)}
          className={`rounded px-2 py-0.5 text-xs font-medium disabled:opacity-50 ${
            value === status
              ? "bg-zinc-800 text-white"
              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
