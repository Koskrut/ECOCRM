"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getOrder } from "@/lib/api";
import { orderStatusLabel } from "@/lib/cabinet-utils";
import { formatCabinetDate } from "@/lib/cabinet-utils";

function DeliverySummary({ data }: { data: unknown }) {
  const d = data as Record<string, unknown> | null;
  if (!d) return null;
  const cityName = d.cityName as string | undefined;
  const warehouseNumber = d.warehouseNumber as string | undefined;
  const warehouseName = d.warehouseName as string | undefined;
  const streetName = d.streetName as string | undefined;
  const building = d.building as string | undefined;
  const flat = d.flat as string | undefined;
  const firstName = d.firstName as string | undefined;
  const lastName = d.lastName as string | undefined;
  const phone = d.phone as string | undefined;
  if (!cityName && !streetName) return null;
  const parts: string[] = [];
  if (cityName) {
    if (warehouseNumber || warehouseName) {
      parts.push(`${cityName}, ${warehouseName ?? `відд. ${warehouseNumber}`}`);
    } else {
      parts.push(cityName);
    }
  }
  if (streetName) {
    const addr = [streetName, building, flat].filter(Boolean).join(", ");
    if (addr) parts.push(addr);
  }
  if (firstName || lastName) parts.push([firstName, lastName].filter(Boolean).join(" "));
  if (phone) parts.push(phone);
  if (parts.length === 0) return null;
  return (
    <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <h3 className="text-sm font-medium text-zinc-500">Доставка</h3>
      <p className="mt-1 text-sm text-zinc-900">{parts.join(" · ")}</p>
    </div>
  );
}

export default function CabinetOrderPage() {
  const params = useParams();
  const id = params.id as string;
  const [order, setOrder] = useState<Awaited<ReturnType<typeof getOrder>> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getOrder(id)
      .then(setOrder)
      .catch(() => setErr("Замовлення не знайдено"));
  }, [id]);

  if (err) {
    return (
      <div>
        <p className="text-red-600">{err}</p>
        <Link href="/cabinet/orders" className="mt-4 inline-block text-[var(--primary)] hover:underline">
          ← До замовлень
        </Link>
      </div>
    );
  }
  if (!order) {
    return (
      <div>
        <div className="h-8 w-48 animate-pulse rounded bg-zinc-200" />
        <div className="mt-6 h-64 animate-pulse rounded-xl bg-zinc-200" />
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/cabinet/orders"
        className="mb-6 inline-flex items-center text-sm text-zinc-600 hover:text-[var(--primary)]"
      >
        ← До замовлень
      </Link>
      <h1 className="font-heading text-2xl font-semibold text-zinc-900">
        Замовлення {order.orderNumber}
      </h1>
      <p className="mt-1 text-zinc-500">
        Статус: {orderStatusLabel(order.status)}
      </p>
      <p className="mt-1 text-sm text-zinc-500">
        Створено: {formatCabinetDate(order.createdAt)}
      </p>
      <p className="mt-1 font-medium">
        Сума: {order.totalAmount} грн (оплачено: {order.paidAmount} грн)
      </p>
      {(order.deliveryMethod || order.paymentMethod) && (
        <p className="mt-1 text-sm text-zinc-500">
          {[order.deliveryMethod, order.paymentMethod].filter(Boolean).join(" · ")}
        </p>
      )}
      <DeliverySummary data={order.deliveryData} />
      {order.comment && (
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <h3 className="text-sm font-medium text-zinc-500">Коментар</h3>
          <p className="mt-1 text-sm text-zinc-900">{order.comment}</p>
        </div>
      )}
      <ul className="mt-6 space-y-3">
        {order.items.map((i) => (
          <li
            key={i.id}
            className="flex justify-between rounded-xl border border-[var(--border)] bg-white p-4 shadow-sm"
          >
            <span className="text-zinc-900">{i.name} ({i.sku})</span>
            <span className="text-zinc-600">
              {i.qty} × {i.price} = {i.lineTotal} грн
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
