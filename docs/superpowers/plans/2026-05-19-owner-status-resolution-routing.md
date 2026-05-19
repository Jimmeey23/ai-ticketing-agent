# Owner Status Resolution Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add owner/admin-only status changes, structured resolution capture, clear-all notifications, category-level routing, and advanced routing bulk controls.

**Architecture:** Shared pure helpers handle ticket status permissions and category-level routing so they are easy to test. React components consume those helpers for UI behavior, while `TicketContext` performs the final client-side authorization guard and persists resolution detail into ticket metadata plus ticket events.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Supabase JS, Tailwind, shadcn primitives, lucide-react.

---

## File Map

- Modify `src/lib/ticketing-data.ts`: add ticket metadata typing.
- Create `src/lib/ticket-permissions.ts`: pure owner/admin status permission helper.
- Create `src/lib/ticket-permissions.test.ts`: red/green tests for admin, owner, and non-owner status access.
- Modify `src/lib/routing-settings.ts`: default category-level rules and resolver specificity.
- Create `src/lib/routing-settings.test.ts`: category routing and legacy subcategory precedence tests.
- Modify `src/components/ticketing/TicketContext.tsx`: expose permission state, notification read actions, metadata patch mapping, and structured status update handling.
- Modify `src/components/ticketing/TicketDetailDrawer.tsx`: replace bare status dropdown with resolution detail form.
- Modify `src/components/AppLayout.tsx`: add clear-all notifications button and Settings routing filters/bulk operations.

## Tasks

### Task 1: Tests for Permission and Routing Helpers

- [ ] Add `src/lib/ticket-permissions.test.ts` with tests proving admins can update any status, assigned owners can update their tickets, owner email matches work, and unrelated support users cannot update.
- [ ] Add `src/lib/routing-settings.test.ts` with tests proving blank subcategory category rules resolve for any subcategory, and active subcategory-specific rules still win when present.
- [ ] Run `npm test -- src/lib/ticket-permissions.test.ts src/lib/routing-settings.test.ts` and confirm the new tests fail because the helpers/behavior are missing.

### Task 2: Permission, Metadata, and Routing Implementation

- [ ] Add `src/lib/ticket-permissions.ts` and update `Ticket` metadata typing.
- [ ] Update `routing-settings.ts` defaults to emit category-level rules and adjust specificity so subcategory rules are optional.
- [ ] Run the focused tests and confirm they pass.

### Task 3: Status Resolution and Notifications

- [ ] Extend `TicketContext` with `canUpdateTicketStatus`, `updateTicketStatus`, `clearAllNotifications`, and metadata persistence.
- [ ] Update `TicketDetailDrawer` to use the structured status/resolution form and disable it for non-owner support users.
- [ ] Update `NotificationsPanel` to show `Clear all notifications` and call the context read action.

### Task 4: Settings Bulk Controls

- [ ] Refactor Settings routing to show category-level rules, with filters for category, department, owner, location, active state, and priority.
- [ ] Add bulk operations for the filtered routing rules: activate, pause, owner pool, department, escalation, priority, and SLA.
- [ ] Keep controls disabled for non-admin users.

### Task 5: Verification

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Start the Vite dev server and validate the ticket drawer, notifications clear-all button, and settings routing controls in the browser.
