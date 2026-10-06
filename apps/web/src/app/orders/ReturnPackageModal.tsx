"use client";

import { useCallback, useEffect, useState } from "react";
import { EntityModalShell } from "@/components/modals/EntityModalShell";
import { TtnStatusBadge } from "@/components/TtnStatusBadge";
import { formatDate } from "@/lib/crmDatetime";
import {
  returnPackagesApi,
  type ReturnPackage,
} from "@/lib/api/resources/return-packages";
import { returnStatusLabel } from "@/lib/returns/return-labels";
import { strings } from "@/locales";

const tr = strings.kanban;
const tReturns = strings.returns;

export function ReturnPackageModal({
  packageId,
  onClose,
  onOpenReturn,
  onOpenContact,
  zIndex = 50,
}: {
  packageId: string;
  onClose: () => void;
  onOpenReturn?: (returnId: string) => void;
  onOpenContact?: (contactId: string) => void;
  zIndex?: number;
}) {
  const [pkg, setPkg] = useState<ReturnPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await returnPackagesApi.getById(packageId);
      setPkg(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не вдалося завантажити посилку");
      setPkg(null);
    } finally {
      setLoading(false);
    }
  }, [packageId]);

  useEffect(() => {
    void load();
  }, [load]);

  const contactName = pkg?.contact
    ? `${pkg.contact.lastName ?? ""} ${pkg.contact.firstName ?? ""}`.trim() ||
      pkg.contact.phone
    : null;

  const left = loading ? (
    <p className="text-sm text-zinc-500">{strings.common.loading}</p>
  ) : err && !pkg ? (
    <p className="text-sm text-red-600">{err}</p>
  ) : pkg ? (
    <div className="space-y-4">
      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Статус</div>
          <div className="mt-1 text-sm font-medium text-zinc-900">
            {returnStatusLabel(pkg.status)}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Зареєстровано
          </div>
          <div className="mt-1 text-sm text-zinc-800">{formatDate(pkg.createdAt)}</div>
        </div>
        {pkg.warehouse?.name ? (
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              {tReturns.returnWarehouseLabel}
            </div>
            <div className="mt-1 text-sm text-zinc-800">{pkg.warehouse.name}</div>
          </div>
        ) : null}
        {contactName ? (
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Клієнт</div>
            <div className="mt-1 text-sm text-zinc-800">
              {pkg.contactId && onOpenContact ? (
                <button
                  type="button"
                  onClick={() => onOpenContact(pkg.contactId!)}
                  className="font-medium text-sky-700 hover:underline"
                >
                  {contactName}
                </button>
              ) : (
                contactName
              )}
            </div>
          </div>
        ) : null}
      </div>

      {(pkg.ttnStatusCode || pkg.ttnStatusText) && (
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">НП</div>
          <div className="mt-1.5">
            <TtnStatusBadge statusCode={pkg.ttnStatusCode} statusText={pkg.ttnStatusText} />
          </div>
        </div>
      )}

      {pkg.note ? (
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Примітка</div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-800">{pkg.note}</p>
        </div>
      ) : null}

      {pkg.returns.length === 0 ? (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          <div className="font-medium">{tr.unlinkedReturnNoOrder}</div>
          <p className="mt-1 text-sky-800/90">{tr.unlinkedReturnHint}</p>
        </div>
      ) : (
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Повернення
          </div>
          <ul className="mt-2 space-y-2">
            {pkg.returns.map((ret) => (
              <li key={ret.id}>
                {onOpenReturn ? (
                  <button
                    type="button"
                    onClick={() => onOpenReturn(ret.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-sm hover:border-zinc-400"
                  >
                    <span className="font-medium text-zinc-900">{ret.order.orderNumber}</span>
                    <span className="text-xs text-zinc-500">{returnStatusLabel(ret.status)}</span>
                  </button>
                ) : (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm">
                    <span className="font-medium text-zinc-900">{ret.order.orderNumber}</span>
                    <span className="text-xs text-zinc-500">{returnStatusLabel(ret.status)}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  ) : null;

  return (
    <EntityModalShell
      title={`${tr.ttnPrefix} ${pkg?.ttnNumber ?? "…"}`}
      subtitle={contactName ?? undefined}
      left={left}
      canClose
      onClose={onClose}
      size="compact"
      zIndex={zIndex}
    />
  );
}
