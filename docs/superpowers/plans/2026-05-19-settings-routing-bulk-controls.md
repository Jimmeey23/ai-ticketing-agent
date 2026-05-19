# Settings Routing Bulk Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the Settings tab so admins can filter category-level routing rules with multi-select controls and apply richer bulk routing actions reliably.

**Architecture:** Move routing filter and bulk operation behavior into a focused helper module with Vitest coverage. Keep `AppLayout.tsx` responsible for rendering the Settings UI and calling tested helper functions for filter scope, single-rule updates, and bulk actions.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Supabase-backed routing settings.

---

### Task 1: Routing Filter and Bulk Operation Tests

**Files:**
- Create: `src/lib/settings-routing-ops.test.ts`
- Create: `src/lib/settings-routing-ops.ts`

- [ ] **Step 1: Write failing tests**

Add tests that verify:
- Multi-select category, department, owner, location, priority, and active state filters are combined correctly.
- Empty multi-select filters behave as “all”.
- Bulk set owners replaces the owner pool and derives department/escalation from the primary owner.
- Bulk add/remove owners preserves uniqueness and avoids leaving a routing rule ownerless.
- Bulk priority updates SLA hours from `PRIORITY_SLA`.

- [ ] **Step 2: Run the focused test**

Run: `npm test -- src/lib/settings-routing-ops.test.ts`

Expected: FAIL because `src/lib/settings-routing-ops.ts` does not exist yet.

- [ ] **Step 3: Implement helper functions**

Create `src/lib/settings-routing-ops.ts` exporting:
- `EMPTY_ROUTING_FILTERS`
- `uniqueText`
- `filterRoutingRules`
- `applyRoutingRulePatch`
- `applyBulkRoutingOperation`

- [ ] **Step 4: Run the focused test**

Run: `npm test -- src/lib/settings-routing-ops.test.ts`

Expected: PASS.

### Task 2: Settings UI Refactor

**Files:**
- Modify: `src/components/AppLayout.tsx`

- [ ] **Step 1: Replace local routing filter logic**

Import the helper exports from `src/lib/settings-routing-ops.ts`. Remove local single-select filter types and filtering logic from `AppLayout.tsx`.

- [ ] **Step 2: Convert routing filters to multi-select controls**

Use `SettingsMultiSelect` for category, department, owner, location, state, and priority. Keep the search text input. Empty selected arrays mean “All”.

- [ ] **Step 3: Add clearer scope summary**

Show how many category routing rules are in the current filtered scope, how many are active, which cities are included, and how many owner-pool rules are selected.

- [ ] **Step 4: Add richer bulk actions**

Wire buttons for:
- Set owner pool
- Add owners
- Remove owners
- Set department
- Set escalation
- Set priority
- Set SLA
- Activate filtered
- Pause filtered

- [ ] **Step 5: Keep city split routing simple**

Keep the dedicated city split category routing control and set the filter scope to the applied category and department after applying it.

### Task 3: Verification

**Files:**
- Verify: `src/lib/settings-routing-ops.test.ts`
- Verify: `src/components/AppLayout.tsx`

- [ ] **Step 1: Run targeted tests**

Run: `npm test -- src/lib/settings-routing-ops.test.ts`

- [ ] **Step 2: Run full test suite**

Run: `npm test`

- [ ] **Step 3: Run lint**

Run: `npm run lint`

- [ ] **Step 4: Run production build**

Run: `npm run build`
