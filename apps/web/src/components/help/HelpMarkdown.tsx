"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type HelpMarkdownProps = {
  content: string;
  className?: string;
};

export function HelpMarkdown({ content, className = "" }: HelpMarkdownProps) {
  return (
    <div
      className={`prose prose-zinc max-w-none prose-headings:scroll-mt-24 prose-a:text-blue-700 prose-a:no-underline hover:prose-a:underline ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="text-2xl font-semibold text-zinc-900">{children}</h1>,
          h2: ({ children }) => (
            <h2 id={slugifyHeading(String(children))} className="mt-8 text-xl font-semibold text-zinc-900">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 id={slugifyHeading(String(children))} className="mt-6 text-lg font-semibold text-zinc-900">
              {children}
            </h3>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700 not-italic">
              {children}
            </blockquote>
          ),
          ul: ({ children, className }) => {
            const isTaskList = className?.includes("contains-task-list");
            return (
              <ul
                className={
                  isTaskList
                    ? "my-4 space-y-2 rounded-lg border border-emerald-100 bg-emerald-50/50 p-4 pl-4 list-none"
                    : "list-disc space-y-1 pl-5"
                }
              >
                {children}
              </ul>
            );
          },
          ol: ({ children }) => (
            <ol className="my-3 list-decimal space-y-2 pl-6 marker:font-semibold marker:text-zinc-500">{children}</ol>
          ),
          p: ({ children, node }) => {
            const text = node?.children?.map((c) => ("value" in c ? c.value : "")).join("") ?? "";
            const isMetaLine = /^\*\*(Коли|Мета|Час):/.test(text);
            return (
              <p
                className={`text-sm leading-relaxed ${
                  isMetaLine ? "mb-1 font-medium text-zinc-800" : "text-zinc-700"
                }`}
              >
                {children}
              </p>
            );
          },
          li: ({ children, ...props }) => {
            const isTask = props.className?.includes("task-list-item");
            if (isTask) {
              return <li className="flex items-start gap-2 text-sm text-zinc-700 list-none">{children}</li>;
            }
            return <li className="text-sm text-zinc-700">{children}</li>;
          },
          input: ({ checked, disabled, type }) => {
            if (type === "checkbox") {
              return (
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  readOnly
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 text-emerald-600"
                />
              );
            }
            return <input type={type} checked={checked} disabled={disabled} />;
          },
          strong: ({ children }) => <strong className="font-semibold text-zinc-900">{children}</strong>,
          code: ({ children }) => (
            <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs text-zinc-800">{children}</code>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export function extractToc(content: string): { id: string; label: string; level: 2 | 3 }[] {
  const lines = content.split("\n");
  const toc: { id: string; label: string; level: 2 | 3 }[] = [];
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      toc.push({ id: slugifyHeading(h2[1]), label: h2[1].trim(), level: 2 });
      continue;
    }
    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) {
      toc.push({ id: slugifyHeading(h3[1]), label: h3[1].trim(), level: 3 });
    }
  }
  return toc;
}

function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}
