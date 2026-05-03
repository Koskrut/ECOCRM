# E2E / smoke — core CRM (manual + CI hooks)

Автоматизований Playwright-сьют ще не підключений; нижче — мінімальний чеклист після деплою **core-only** (`crm-core-api` + web + postgres).

## Manual smoke (~10 хв)

1. Логін під ADMIN.
2. `/settings/health` — JSON без помилок; `controlPlane` коректний (або `controlPlaneMode: false` у file-only режимі).
3. `/settings/metadata/custom-fields` — список + створення тестового поля (потім можна видалити через API).
4. `/settings/data-import` — upload → validate → commit на 1–2 рядках CSV.
5. Відкрити контакт — блоки Custom fields, Layout (runtime), Audit.
6. `/settings/metadata/workflows` — список rules + execution log завантажуються.

## CI

- `apps/backend`: `npm test` включає `deployment-manifest.contract.spec.ts`.
- `.github/workflows/preflight-release-build.yml` — збірка `core-runner` + `validate-deployment-manifest.mjs`.
