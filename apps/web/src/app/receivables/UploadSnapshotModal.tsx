"use client";

import { useRef, useState } from "react";
import { useToast } from "@/components/feedback";
import { ymdDaysAgoInKyiv } from "@/lib/crmDatetime";
import { strings } from "@/locales";
import { receivablesApi, type ReceivablesSnapshot } from "@/lib/api/resources/receivables";

export function UploadSnapshotModal({
  onClose,
  onUploaded,
}: {
  onClose: () => void;
  onUploaded: (snapshot: ReceivablesSnapshot) => void | Promise<void>;
}) {
  const t = strings.receivables;
  const { pushToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadDate, setUploadDate] = useState(() => ymdDaysAgoInKyiv(0));
  const [uploadNote, setUploadNote] = useState("");
  const [uploadCurrency, setUploadCurrency] = useState("USD");
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("snapshotDate", uploadDate);
      fd.append("currency", uploadCurrency);
      if (uploadNote.trim()) fd.append("note", uploadNote.trim());
      const res = await receivablesApi.uploadSnapshot(fd);
      pushToast(t.uploadSuccess, "success");
      await onUploaded(res.data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t.uploadError;
      pushToast(msg || t.uploadError, "error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-zinc-900">{t.uploadTitle}</h2>
        <p className="mt-1 text-sm text-zinc-500">{t.uploadHint}</p>
        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="text-zinc-600">{t.snapshotDate}</span>
            <input
              type="date"
              value={uploadDate}
              onChange={(e) => setUploadDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-zinc-600">{t.uploadCurrency}</span>
            <select
              value={uploadCurrency}
              onChange={(e) => setUploadCurrency(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            >
              <option value="USD">USD</option>
              <option value="UAH">UAH</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-zinc-600">{t.note}</span>
            <input
              type="text"
              value={uploadNote}
              onChange={(e) => setUploadNote(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUpload(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {uploading ? strings.common.loading : t.chooseFile}
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full text-sm text-zinc-500 hover:text-zinc-700"
        >
          {strings.common.cancel}
        </button>
      </div>
    </div>
  );
}
