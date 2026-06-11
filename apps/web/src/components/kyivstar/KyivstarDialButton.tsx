"use client";

import { Phone, PhoneOff, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { kyivstarFmcApi } from "@/lib/api/resources/kyivstar-fmc";
import { useToast } from "@/components/feedback";
import { useModules } from "@/lib/modules/useModules";
import { ModuleIds } from "@/lib/modules/module-ids";

type Props = {
  phone: string;
  className?: string;
  size?: "sm" | "md";
  label?: string;
};

export function KyivstarDialButton({ phone, className = "", size = "sm", label }: Props) {
  const { effective } = useModules();
  const { pushToast } = useToast();
  const [busy, setBusy] = useState(false);

  const enabled = effective(ModuleIds.KyivstarFmc);
  const digits = phone.replace(/\D/g, "");
  if (!enabled || digits.length < 9) return null;

  const onDial = useCallback(async () => {
    setBusy(true);
    try {
      await kyivstarFmcApi.originate(phone);
      pushToast("Дзвінок ініційовано — підніміть слухавку на вашому Kyivstar-номері", "success");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Не вдалося ініціювати дзвінок";
      pushToast(msg, "error");
    } finally {
      setBusy(false);
    }
  }, [phone, pushToast]);

  const pad = size === "md" ? "px-3 py-2 text-sm" : "px-2 py-1 text-xs";
  const icon = size === "md" ? 16 : 14;

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void onDial()}
      title="Click2Dial через Kyivstar FMC"
      className={`inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 font-medium text-emerald-800 shadow-sm transition hover:from-emerald-100 hover:to-teal-100 disabled:opacity-60 ${pad} ${className}`}
    >
      {busy ? <Loader2 size={icon} className="animate-spin" /> : <Phone size={icon} />}
      {label ?? "Kyivstar"}
    </button>
  );
}

export function KyivstarDialIconButton({ phone, className = "" }: { phone: string; className?: string }) {
  return <KyivstarDialButton phone={phone} className={className} size="sm" label="" />;
}

export function KyivstarRejectButton({
  callControlId,
  onDone,
}: {
  callControlId: string;
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const { pushToast } = useToast();

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void kyivstarFmcApi
          .reject(callControlId)
          .then(() => {
            pushToast("Дзвінок відхилено", "info");
            onDone?.();
          })
          .catch((e) => {
            pushToast(e instanceof Error ? e.message : "Помилка відхилення", "error");
          })
          .finally(() => setBusy(false));
      }}
      className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-red-500/30 transition hover:bg-red-600 disabled:opacity-60"
    >
      {busy ? <Loader2 size={16} className="animate-spin" /> : <PhoneOff size={16} />}
      Відхилити
    </button>
  );
}
