import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ContactQuickActions, ContactQuickActionsMobileBar } from "./ContactQuickActions";

const labels = {
  quickCall: "Дзвінок",
  quickEmail: "Email",
  quickTelegram: "Telegram",
  quickVisit: "Візит",
  quickOrderShort: "Замовлення",
  quickTask: "Задача",
  quickPayment: "Оплата",
  tooltipNoPhone: "Немає номера телефону",
};

describe("ContactQuickActions", () => {
  it("renders actionable links and buttons for available channels", () => {
    const onCreateOrder = vi.fn();
    const onScheduleVisit = vi.fn();
    const onOpenTasks = vi.fn();
    const onOpenPayment = vi.fn();

    render(
      <ContactQuickActions
        phone="+380501112233"
        email="[email protected]"
        telegramLinked
        telegramConversationId="conv-1"
        onCreateOrder={onCreateOrder}
        onScheduleVisit={onScheduleVisit}
        onOpenTasks={onOpenTasks}
        onOpenPayment={onOpenPayment}
        labels={labels}
      />,
    );

    expect(screen.getByRole("link", { name: "Дзвінок" }).getAttribute("href")).toBe("tel:+380501112233");
    expect(screen.getByRole("link", { name: "Email" }).getAttribute("href")).toBe("mailto:%5Bemail%20protected%5D");
    expect(screen.getByRole("link", { name: "Telegram" }).getAttribute("href")).toContain(
      "/inbox/telegram?conversationId=conv-1",
    );

    fireEvent.click(screen.getByRole("button", { name: "Візит" }));
    fireEvent.click(screen.getByRole("button", { name: "Замовлення" }));
    fireEvent.click(screen.getByRole("button", { name: "Задача" }));
    fireEvent.click(screen.getByRole("button", { name: "Оплата" }));

    expect(onScheduleVisit).toHaveBeenCalledTimes(1);
    expect(onCreateOrder).toHaveBeenCalledTimes(1);
    expect(onOpenTasks).toHaveBeenCalledTimes(1);
    expect(onOpenPayment).toHaveBeenCalledTimes(1);
  });

  it("renders disabled placeholders when phone, email and telegram are unavailable", () => {
    render(
      <ContactQuickActions
        phone={null}
        email=""
        telegramLinked={false}
        telegramConversationId={null}
        onCreateOrder={() => undefined}
        onScheduleVisit={() => undefined}
        labels={labels}
      />,
    );

    expect(screen.getByText("Дзвінок").getAttribute("title")).toBe("Немає номера телефону");
    expect(screen.getByText("Email").tagName).toBe("SPAN");
    expect(screen.getByText("Telegram").tagName).toBe("SPAN");
  });
});

describe("ContactQuickActionsMobileBar", () => {
  it("prefers payment action over tasks when payment is available", () => {
    render(
      <ContactQuickActionsMobileBar
        phone="+380501112233"
        onCreateOrder={() => undefined}
        onScheduleVisit={() => undefined}
        onOpenTasks={() => undefined}
        onOpenPayment={() => undefined}
        labels={labels}
      />,
    );

    expect(screen.getByRole("button", { name: "Оплата" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Задача" })).toBeNull();
  });
});
