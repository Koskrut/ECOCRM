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

- **Props**: `title`, `subtitle?`, `headerActions?` (ReactNode), `left`, `right`, `footer?`, `canClose`, `onClose`, `onEscape?`.
- **Overlay**: clicking the dimmed background calls `onClose` only when `canClose === true`.
- **ESC**: if `onEscape` is provided, it is called first; if it returns `true`, the modal does not close. Otherwise, when `canClose`, `onClose` is called. This gives priority: nested state (e.g. open order inside contact) closes first, then the modal itself.
- **Height**: `max-h-[90vh]`; scrolling only inside the left and right columns.

### FeedTabsScaffold

File: `apps/web/src/components/modals/FeedTabsScaffold.tsx`

- Small feed tabs (e.g. Activity | Comment) above the timeline. Comment can be scaffold-only when there is no API. Pass `activityContent` (e.g. timeline) and optional `commentContent`.

### SearchableSelectLite

File: `apps/web/src/components/inputs/SearchableSelectLite.tsx`

- Reusable searchable select: click opens list, typing filters options, optional “Create” button (`onCreate`).
- Exports: component `SearchableSelectLite` and type `Option` (`id`, `label`, `meta?`).

## Usage by entity

- **LeadModal**: left column — main fields + products; right — timeline. When status allows, header action “Convert” opens conversion wizard in the right column (no API changes).
- **ContactModal**: left — contact card (form/details) + Orders block; right — feed (ContactTimeline). Company uses SearchableSelectLite; with `onOpenCompany`, “Open company” is available. Nested OrderModal: ESC/overlay close the order first.
- **CompanyModal**: left — details/edit + Contacts block (SearchableSelectLite to link + “Open contact” when `onOpenContact`) + Orders block; right — CompanyTimeline. Header “+ Order”.
- **OrderModal**: two-column (details + items left, timeline right). Header: “Create TTN (NP)”, “Copy number”, “Print” (scaffold). Status stepper is clickable (PATCH `/orders/:id/status`). Row delete for items not added (no DELETE items API).

## Principles

1. **No API changes**: all endpoints, DTOs, and business logic stay as-is; only UI/UX and component refactors.
2. **Single UI language**: English for labels and messages; data and enums unchanged.
3. **Nested modals**: when opening an order from contact/company, ESC and overlay first handle the nested modal (via `onEscape` in the shell), then the parent.
4. **New entities**: for a new entity modal use `EntityModalShell`, pass `left` (card + list blocks if needed) and `right` (feed/timeline). Set header actions and footer via `headerActions` and `footer`. Use `SearchableSelectLite` for relation pickers.

## Adding a new entity modal

1. Import `EntityModalShell` from `@/components/modals/EntityModalShell`.
2. Build left column content (form/details + tables/lists as needed).
3. Build right column content (timeline or equivalent; optionally wrap in `FeedTabsScaffold`).
4. Pass to the shell: `title`, `subtitle?`, `headerActions`, `left`, `right`, `footer?`, `canClose`, `onClose`; for nested modals pass `onEscape` (return `true` when nested state is closed).
5. Use `SearchableSelectLite` from `@/components/inputs/SearchableSelectLite` for searchable selects.
