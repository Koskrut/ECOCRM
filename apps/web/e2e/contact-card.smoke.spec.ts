import { expect, test } from "@playwright/test";

const EMAIL = process.env.CRM_E2E_EMAIL ?? "admin@ecocrm.local";
const PASSWORD = process.env.CRM_E2E_PASSWORD ?? "admin12345";
const CONTACT_ID = process.env.CRM_E2E_CONTACT_ID ?? "demo-contact-1";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.locator('input[autocomplete="email"]').fill(EMAIL);
  await page.locator('input[type="password"][autocomplete="current-password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function ensureContactCardV2Enabled(page: import("@playwright/test").Page) {
  await page.goto("/settings/contact-card-ui");
  const toggle = page.getByRole("checkbox");
  await expect(toggle).toBeVisible();
  if (!(await toggle.isChecked())) {
    await toggle.check();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved. Contact card clients will refetch the runtime flag.")).toBeVisible();
  }
}

test("desktop smoke: opens contact card with KPI, actions and tabs", async ({ page }) => {
  await login(page);
  await ensureContactCardV2Enabled(page);

  await page.goto(`/contacts?contactId=${CONTACT_ID}`);

  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Контакт")).toBeVisible();
  await expect(page.getByText("Іван Петренко")).toBeVisible();
  await expect(page.getByText("Угоди")).toBeVisible();
  await expect(page.getByText("Оборот")).toBeVisible();
  await expect(page.getByRole("button", { name: "Замовлення" }).last()).toBeVisible();
  await expect(page.getByRole("button", { name: "Задачі" }).last()).toBeVisible();
  await expect(page.getByRole("button", { name: "Історія змін" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Дзвінок" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Email" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Задачі" }).last().click();
  await expect(page.getByRole("heading", { name: "Задачі" })).toBeVisible();
});

test("mobile smoke: shows sticky bottom quick actions", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await ensureContactCardV2Enabled(page);

  await page.goto(`/contacts?contactId=${CONTACT_ID}`);

  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("link", { name: "Дзвінок" }).last()).toBeVisible();
  await expect(page.getByRole("button", { name: "Замовлення" }).last()).toBeVisible();
  await expect(page.getByRole("button", { name: "Візит" }).last()).toBeVisible();
});
