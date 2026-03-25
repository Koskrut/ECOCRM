import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContactKpiStrip } from "./ContactKpiStrip";
import type { ContactCardPayload } from "./contact-card.types";

const cardPayload: ContactCardPayload = {
  kpi: {
    orderCount: 3,
    totalRevenue: 12500,
    totalDebt: 1300,
    overdueDebt: 400,
    averageOrderValue: 4166.67,
    lastOrderAt: "2026-03-20T10:00:00.000Z",
    lastActivityAt: "2026-03-21T12:00:00.000Z",
  },
  kpiAccess: {
    showPartialDataNotice: true,
    partialDataNotice: "Показано показники лише з угод, доступних вам.",
  },
  canonicalOrders: { total: 3, items: [] },
  legacyLinkedOrders: { total: 2, items: [] },
  companyOrders: { total: 1, items: [] },
};

describe("ContactKpiStrip", () => {
  it("renders KPI labels, values and partial-data notice", () => {
    render(<ContactKpiStrip data={cardPayload} loading={false} />);

    expect(screen.getByText("Показано показники лише з угод, доступних вам.")).toBeTruthy();
    expect(screen.getByText("Угоди")).toBeTruthy();
    expect(screen.getByText("Оборот")).toBeTruthy();
    expect(screen.getByText("Борг")).toBeTruthy();
    expect(screen.getByText("Прострочено")).toBeTruthy();
    expect(screen.getByText("Останнє замовлення")).toBeTruthy();
    expect(screen.getByText("Активність")).toBeTruthy();
    expect(screen.getByText(/Замовлення лише за ТТН/)).toBeTruthy();
    expect(screen.getByText(/Замовлення компанії/)).toBeTruthy();
  });

  it("renders skeleton when loading without data", () => {
    const { container } = render(<ContactKpiStrip data={null} loading />);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders nothing when there is no data and not loading", () => {
    const { container } = render(<ContactKpiStrip data={null} loading={false} />);
    expect(container.innerHTML).toBe("");
  });
});
