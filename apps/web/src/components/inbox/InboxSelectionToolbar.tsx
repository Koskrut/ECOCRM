"use client";

import { useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";

type Props = {
  /** Called with the currently selected text from an inbound bubble. */
  onCreateTaskFromSelection: (text: string) => void;
};

/**
 * Floating action when the user selects text inside an inbound message bubble.
 */
export function InboxSelectionToolbar({ onCreateTaskFromSelection }: Props) {
  const [sel, setSel] = useState<{ text: string; x: number; y: number } | null>(null);

  useEffect(() => {
    const onMouseUp = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) {
        setSel(null);
        return;
      }
      const text = selection.toString().trim();
      if (!text || text.length < 2) {
        setSel(null);
        return;
      }
      const anchor = selection.anchorNode?.parentElement;
      if (!anchor?.closest("[data-inbox-inbound]")) {
        setSel(null);
        return;
      }
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setSel({
        text,
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
      });
    };
    const onScroll = () => setSel(null);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, []);

  if (!sel) return null;

  return (
    <div
      className="fixed z-50 -translate-x-1/2 -translate-y-full"
      style={{ left: sel.x, top: sel.y }}
    >
      <button
        type="button"
        onClick={() => {
          onCreateTaskFromSelection(sel.text);
          setSel(null);
          window.getSelection()?.removeAllRanges();
        }}
        className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 shadow-md hover:bg-zinc-50"
      >
        <ClipboardList className="h-3.5 w-3.5" />
        Поставити завдання
      </button>
    </div>
  );
}
