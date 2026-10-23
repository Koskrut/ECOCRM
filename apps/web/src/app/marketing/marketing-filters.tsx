"use client";

import { strings } from "@/locales";

const t = strings.marketing;

export function Filters(props: {
  platform: string;
  from: string;
  to: string;
  windowDays: number;
  onPlatform: (value: string) => void;
  onFrom: (value: string) => void;
  onTo: (value: string) => void;
  onWindow: (value: number) => void;
}) {
  const platforms = [
    ["ALL", t.platforms.all],
    ["META", t.platforms.meta],
    ["GOOGLE", t.platforms.google],
    ["TIKTOK", t.platforms.tiktok],
  ] as const;
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-wrap gap-2">
        {platforms.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => props.onPlatform(id)}
            className={`rounded-full px-3 py-1.5 text-sm ${props.platform === id ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 ring-1 ring-zinc-200"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="text-xs text-zinc-500">
        {t.period}
        <span className="mt-1 flex gap-2">
          <input type="date" value={props.from} onChange={(e) => props.onFrom(e.target.value)} className="rounded-md border border-zinc-200 px-2 py-1 text-sm" />
          <input type="date" value={props.to} onChange={(e) => props.onTo(e.target.value)} className="rounded-md border border-zinc-200 px-2 py-1 text-sm" />
        </span>
      </label>
      <div className="flex gap-2">
        {[7, 30, 90].map((days) => (
          <button
            key={days}
            type="button"
            onClick={() => props.onWindow(days)}
            className={`rounded-full px-3 py-1.5 text-sm ${props.windowDays === days ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 ring-1 ring-zinc-200"}`}
          >
            {t.window} {days}
          </button>
        ))}
      </div>
    </div>
  );
}
