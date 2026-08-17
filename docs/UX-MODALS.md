# CRM Entity Modal UX Pattern

## Overview

All entity modals (lead, contact, company, order) follow a single **entity modal standard** (crm modal standard): one shell, two columns (left: card/fields, right: activity feed), shared header/footer, and consistent ESC and overlay behavior.

## Structure

- **HEADER**: title + optional subtitle + context actions (buttons) + close (✕).
- **BODY**: 12-column grid. Left 7 columns — entity card (fields, tables, blocks such as Orders/Contacts). Right 5 columns — activity feed (timeline/activities/events). Both columns scroll independently; the shell content does not scroll as a whole.
- **FOOTER** (optional): primary actions (Save/Cancel) when editing or creating, or extra info (e.g. ID).

## Components

### EntityModalShell

File: `apps/web/src/components/modals/EntityModalShell.tsx`

- **Props**: `title`, `subtitle?`, `headerActions?` (ReactNode), `left`, `right`, `footer?`, `canClose`, `onClose`, `onEscape?`, `size?` (`default` | `compact`), `tabsUnderHeader?`, `zIndex?` (default `50`).
- **`size`**: `default` uses `sm:max-w-5xl` (full entity card). `compact` uses `sm:max-w-xl` for short create flows.
- **`zIndex`**: use `60` (or higher) for modals opened on top of another entity modal (nested order, sibling company/contact, TTN dialog, etc.).
- **Overlay**: clicking the dimmed background or ✕ first calls `onEscape` (same as ESC). If it returns `true`, the modal stays open. Otherwise, when `canClose`, `onClose` is scheduled via `scheduleModalClose` so the click event finishes before unmount (prevents click-through to the parent modal underneath).
- **ESC**: if `onEscape` is provided, it is called first; if it returns `true`, the modal does not close. Otherwise, when `canClose`, `onClose` is called. This gives priority: nested state (e.g. open order inside contact) closes first, then the modal itself.
- **Height**: `max-h-[90vh]`; scrolling only inside the left and right columns.

### scheduleModalClose

File: `apps/web/src/lib/modal/scheduleModalClose.ts`

- Defers `onClose` to the next microtask (`queueMicrotask`).
- Use in custom overlay modals (TtnModal, FxWriteOffModal, confirm dialogs, etc.) when closing on backdrop click, so the parent entity modal does not receive the same click.

### useEntityModalStack / EntityModalStackLayers

Files: `apps/web/src/lib/modal/useEntityModalStack.ts`, `apps/web/src/components/modals/EntityModalStackLayers.tsx`

- Page-level stack for contact / company / order / return. The list URL param is the root; further entity opens are overlays.
- `open` pushes, or crops back if that entity is already in the stack. `closeFrom(index)` pops that layer and everything above it.
- List hosts (contacts, companies, orders, receivables) render `EntityModalStackLayers` instead of replacing the root id.

### FeedTabsScaffold

File: `apps/web/src/components/modals/FeedTabsScaffold.tsx`

- Small feed tabs (e.g. Activity | Comment) above the timeline. Comment can be scaffold-only when there is no API. Pass `activityContent` (e.g. timeline) and optional `commentContent`.

### SearchableSelectLite

File: `apps/web/src/components/inputs/SearchableSelectLite.tsx`

- Reusable searchable select: click opens list, typing filters options, optional “Create” button (`onCreate`).
- Exports: component `SearchableSelectLite` and type `Option` (`id`, `label`, `meta?`).

## Usage by entity

- **LeadModal**: left column — main fields + products; right — timeline. When status allows, header action “Convert” opens conversion wizard in the right column (no API changes).
- **ContactModal (edit)**: tabs under header (Overview, Analytics, Timeline, Orders, …); left — contact card + blocks; optional right — feed. Company uses SearchableSelectLite; with `onOpenCompany`, “Open company” is available. Nested OrderModal: ESC/overlay close the order first.
- **ContactModal (create, `contactId=new`)**: `size=compact`, no tabs; `ContactCreateForm` with Main + collapsed Additional sections; footer: Cancel, Save and close, Save (stays in modal → loads card). `onCreated(id)` syncs parent URL/state. Optional `initialCreate` prefill (`companyId`, `phone`, names). Debounced duplicate-phone hint via `GET /contacts?q=…`.
- **CompanyModal**: left — details/edit + Contacts block (SearchableSelectLite to link + “Open contact” when `onOpenContact`) + Orders block; right — CompanyTimeline. Header “+ Order”.
- **OrderModal**: two-column (details + items left, timeline right). Header: “Create TTN (NP)”, “Copy number”, “Print” (scaffold). Status stepper is clickable (PATCH `/orders/:id/status`). Row delete for items not added (no DELETE items API).

## Principles

1. **No API changes**: all endpoints, DTOs, and business logic stay as-is; only UI/UX and component refactors.
2. **Single UI language**: English for labels and messages; data and enums unchanged.
3. **Nested modals**: entity-to-entity navigation (contact ↔ company ↔ order ↔ return) **pushes** a new layer; ✕ / overlay / ESC **pops** one layer. The URL keeps only the **root** modal opened from the list. Re-opening an entity already in the stack returns to that frame instead of duplicating it. Overlay chains are in-memory and reset on refresh (same as nested orders before). Child layers use a higher `zIndex` (`50 + index * 10`). Custom overlays on top of entity modals must also use `scheduleModalClose` on backdrop close.
4. **New entities**: for a new entity modal use `EntityModalShell`, pass `left` (card + list blocks if needed) and `right` (feed/timeline). Set header actions and footer via `headerActions` and `footer`. Use `SearchableSelectLite` for relation pickers.

Shared stack: `useEntityModalStack` (`apps/web/src/lib/modal/useEntityModalStack.ts`) plus `EntityModalStackLayers` on list pages (contacts, companies, orders, receivables). Do not `router.replace` the root id when opening a related entity.

## Adding a new entity modal

1. Import `EntityModalShell` from `@/components/modals/EntityModalShell`.
2. Build left column content (form/details + tables/lists as needed).
3. Build right column content (timeline or equivalent; optionally wrap in `FeedTabsScaffold`).
4. Pass to the shell: `title`, `subtitle?`, `headerActions`, `left`, `right`, `footer?`, `canClose`, `onClose`; for nested modals pass `onEscape` (return `true` when nested state is closed) and `zIndex` when stacked over another modal.
5. Use `SearchableSelectLite` from `@/components/inputs/SearchableSelectLite` for searchable selects.
6. For custom `fixed inset-0` overlays, import `scheduleModalClose` and call it from backdrop/✕ handlers; stop propagation on `mousedown`/`click` for the backdrop.
