# Athena Ticketing System — Full Audit & Implementation Plan

**Prepared:** May 19, 2026
**Scope:** All source files under `src/`, `supabase/functions/`, `src/lib/`
**Status:** Analysis only — no code changes made

---

## Part 1 — Root Cause: AI Asking for Member Name & Class Date for Unrelated Issues

### What's happening

When a user types something like "washing machine not working", Athena (GPT-4o-mini) returns a `detailForm` that includes `memberName` and `classDateTime` fields — even though those fields are irrelevant to a facilities/maintenance issue.

### Why it's happening — the full chain

**Step 1 — AI ignores the system prompt instruction.**
Both system prompts (frontend `ATHENA_SYSTEM_PROMPT` and backend) say:
> "Do not include memberName, memberContact, classType, sessionId, classDateTime, or trainer in detailForm unless those fields are necessary for the described incident."

GPT-4o-mini, being a smaller/cheaper model, does not reliably follow this instruction when combined with the rest of the long prompt. It defaults to asking for "standard" fields it has seen in training.

**Step 2 — The backend trusts the AI's form without filtering.**
In `ticket-ai-chat/index.ts` (lines 938–952):
```typescript
detailForm: aiResponse.detailForm || (guardedMissingFields.length > 0
  ? { fields: Array.from(new Set(guardedMissingFields)) }
  : null),
```
The `aiResponse.detailForm` is returned **as-is** if it exists. The `guardedMissingFields` guard (which correctly computes that `memberName` is NOT needed for a facilities issue) is only used as a fallback when the AI provides no form — never to filter the AI's own form.

**Step 3 — The frontend's `pruneDetailForm` only removes already-filled fields.**
In `ChatInterface.tsx` (line 1239):
```typescript
const normalizedForm = pruneDetailForm(normalizeDetailForm(data?.detailForm), responseContext);
```
`pruneDetailForm` strips fields that already have a value in `context`. It does NOT strip fields that shouldn't be required at all. So if the AI says "ask for memberName" and the user hasn't selected a member yet, memberName stays in the form.

### The fix (proposed)

**In `ticket-ai-chat/index.ts`:** After calling `askAiForIntake`, filter the AI's returned `detailForm.fields` by removing any "entity" field (`memberName`, `memberContact`, `classType`, `classDateTime`, `trainer`, `sessionId`, `membership`) that does NOT appear in `guardedMissingFields`. Allow through any AI-generated issue-specific custom fields (fields not in the protected list).

```typescript
// Pseudocode — in the aiResponse handler block:
const PROTECTED_ENTITY_FIELDS = new Set([
  'memberName', 'memberContact', 'classType',
  'classDateTime', 'trainer', 'sessionId', 'membership',
]);

function filterAiDetailFormFields(
  form: AiDetailForm | null | undefined,
  guardedFields: DetailFieldId[]
): AiDetailForm | null {
  if (!form) return null;
  const guardedSet = new Set(guardedFields);
  const filteredFields = form.fields.filter((field) => {
    // Always allow non-entity fields (AI-generated specific ones)
    if (!PROTECTED_ENTITY_FIELDS.has(field.id)) return true;
    // Only allow entity fields if business rules also require them
    return guardedSet.has(field.id as DetailFieldId);
  });
  if (filteredFields.length === 0) return null;
  return { ...form, fields: filteredFields };
}

// Then in the response:
const filteredAiForm = filterAiDetailFormFields(aiResponse.detailForm, guardedMissingFields);
```

**In `ChatInterface.tsx`:** No change needed to the frontend filtering logic — the fix is upstream in the edge function. But as an additional safety net, the same `PROTECTED_ENTITY_FIELDS` filter can be applied after `normalizeDetailForm` on the client side.

---

## Part 2 — Critical Bugs & Discrepancies

### BUG 1: Legacy SLA freeze corrupts ticket dates on new devices

**File:** `src/components/ticketing/TicketContext.tsx` (lines 875–896)

A `useEffect` runs on every login and mass-updates ALL ticket `sla_due_at` dates to `2100-01-01` for any session that hasn't set a `localStorage` key. Since `localStorage` is device-specific, this destructive operation runs again on any new browser or device.

**Risk:** Any staff member logging in on a new device will set all tickets' SLA dates to year 2100, breaking SLA tracking for everyone.

**Fix:** Replace the client-side localStorage gate with a server-side migration flag stored in Supabase (e.g., a `system_flags` table or a one-time SQL migration). The client-side effect should be removed entirely.

---

### BUG 2: Duplicate `ASSIGNMENT_RULES` with contradictory values

**Files:** `supabase/functions/ticket-ai-chat/index.ts` vs `src/lib/ticketing-data.ts`

| Category | Edge Function assigns to | Frontend assigns to |
|---|---|---|
| `Safety and Security` | `Zahur Shaikh` (Operations) | `Saachi Shetty - Operations` |
| `Safety & Medical` | `Zahur Shaikh` (Operations) | `Saachi Shetty - Operations` |
| `Front Desk & Service` | `Akshay Rane` (Sales) | `Nunu Yeptomi` (Customer Service) |

This means a ticket created via the AI intake chat uses different assignees than a ticket created manually or updated by the frontend. Routing is inconsistent.

**Fix:** Remove the hardcoded `ASSIGNMENT_RULES` object from the edge function. The edge function should call the same logic that `resolveTicketAssignee` + `resolveTicketDepartment` in `ticketing-data.ts` uses, or share a single source of truth via a shared config import (if running in a monorepo). Since the edge function is Deno and can't import from `src/`, the assignment tables should be driven entirely by the `issue_routing_rules` table in Supabase, which the edge function already has access to.

---

### BUG 3: `inferContextFromText` (edge function) vs `inferIntakeContextFromText` (intake-rules.ts) — divergence

**Files:** `supabase/functions/ticket-ai-chat/index.ts` (line 582) vs `src/lib/intake-rules.ts` (line 127)

Both functions infer category, priority, studio, and intakeRoute from free text. They have subtle differences:

- `intake-rules.ts` matches `roll\s?over` (with optional space); edge function uses `roll\s?over` too — same here
- `intake-rules.ts` handles `rollover` inside billing regex; edge function uses `roll over` only
- `intake-rules.ts` adds `urgencyReason` to inferred context; edge function does not
- Edge function checks `equipment` for Studio Amenities; `intake-rules.ts` has a broader pattern including `cold|hot|odor|ventilation`

Because the AI path (when OpenAI responds) uses the edge function's inference logic, and the client-side fallback uses `intake-rules.ts`, the same text can be categorized differently depending on whether the AI is available.

**Fix:** Consolidate both inference functions into a single implementation. Since the edge function is isolated, the best approach is to copy the final agreed-upon regex map into both places and add a comment linking them, or move to a shared lookup table in Supabase.

---

### BUG 4: `subCategory` dropdown in detailForm shows ALL subcategories from ALL categories

**File:** `src/components/ticketing/ChatInterface.tsx` (lines 270–274)

```typescript
subCategory: {
  id: 'subCategory',
  label: 'Specific Touchpoint',
  type: 'select',
  options: Object.values(CATEGORIES).flat(), // 350+ options from ALL 24 categories!
},
```

When `subCategory` appears in a detail form (without a category already set), the user sees every subcategory from every category combined — making it nearly unusable.

The chip suggestions (`chipsForSingleField`) correctly filter by category, but the actual form dropdown does not.

**Fix:** Change `normalizeDetailForm` to dynamically pass `options` for `subCategory` based on the current context's category. If `context.category` is set, filter `CATEGORIES[context.category]`. If not, show at most the subcategories for the inferred category.

---

## Part 3 — Unused / Dead Code

### DEAD 1: `extractCreatedTicket` and `extractCreatedTicketId` in TicketContext.tsx

**File:** `src/components/ticketing/TicketContext.tsx` (lines 380–439)

Both functions are defined and call themselves recursively, but are **never called from outside their own definition**. They are pure dead code — likely left over from an earlier version of the ticket creation flow.

**Fix:** Remove both functions.

---

### DEAD 2: Backend `ATHENA_SYSTEM_PROMPT` is never used

**File:** `supabase/functions/ticket-ai-chat/index.ts` (lines 56–80)

The edge function uses `cleanString(body.instructions, ATHENA_SYSTEM_PROMPT)` — so the backend prompt is the fallback if no instructions are sent. But `ChatInterface.tsx` always passes `instructions: ATHENA_SYSTEM_PROMPT` (its own copy). The backend's prompt is never reached.

**Fix:** Either (a) remove the backend `ATHENA_SYSTEM_PROMPT` constant and rely on the frontend always providing it (add a validation error if `instructions` is missing), or (b) move the authoritative prompt to the backend and stop sending it from the frontend (better for security — model behavior shouldn't be overridable by the client).

Option (b) is recommended: remove `instructions` from the frontend request body and make the backend's prompt authoritative. This also prevents users or malicious actors from injecting custom instructions.

---

### DEAD 3: `needsStructuredDetails` is just an alias for `requiredFieldsForIssue`

**File:** `supabase/functions/ticket-ai-chat/index.ts` (lines 741–743)

```typescript
function needsStructuredDetails(text: string, context: Record<string, unknown>): DetailFieldId[] {
  return requiredFieldsForIssue(text, context);
}
```

This function adds zero value. Every call to `needsStructuredDetails` should just call `requiredFieldsForIssue` directly.

**Fix:** Remove `needsStructuredDetails` and inline the call.

---

### DEAD 4: `resolveTeam` in TicketContext.tsx is a trivial pass-through

**File:** `src/components/ticketing/TicketContext.tsx` (lines 480–482)

```typescript
function resolveTeam(assignedTo: string, category: string): string {
  return resolveTicketDepartment(category, assignedTo);
}
```

Note the argument order is even swapped from `resolveTicketDepartment(category, assignedTo)`. This wrapper adds confusion rather than clarity.

**Fix:** Replace all calls to `resolveTeam(assignedTo, category)` with direct calls to `resolveTicketDepartment(category, assignedTo)`.

---

## Part 4 — Duplicated Logic (DRY Violations)

### DUP 1: `isBengaluruStudio` / `isBandraStudio` defined twice

- `src/lib/ticketing-data.ts` (lines 685–691)
- `supabase/functions/ticket-ai-chat/index.ts` (lines 176–180)

Same regex, same logic. Edge function can't import from `src/lib/` because it's Deno, so these must exist in both places — but they should at least be identical (they are, currently). A comment should mark them as "mirrors" to prevent future drift.

---

### DUP 2: `getMissingColumnName` / `removeUnsupportedTicketColumn` defined twice

- `src/components/ticketing/TicketContext.tsx` (lines 185–200)
- `supabase/functions/ticket-ai-chat/index.ts` (lines 807–821)

Identical implementations. On the frontend side, these could be extracted to `src/lib/utils.ts`. The edge function copy stays as-is (Deno isolation).

---

### DUP 3: `buildSourceRef` defined twice with identical logic

- `src/components/ticketing/TicketContext.tsx` (lines 519–539)
- `supabase/functions/ticket-ai-chat/index.ts` (lines 745–765)

Both compute the same deterministic hash from the draft fields. Frontend copy should live in `src/lib/utils.ts`.

---

### DUP 4: `computeSlaDueAt` defined twice with different data sources

- `src/components/ticketing/TicketContext.tsx`: reads from `PRIORITY_SLA[priority].hours` (imported from ticketing-data)
- `supabase/functions/ticket-ai-chat/index.ts`: reads from local `PRIORITY_SLA_HOURS` object (`{ Critical: 2, High: 8, Medium: 24, Low: 72 }`)

The values are the same right now, but they could drift. The edge function should declare its SLA hours as a comment reference to match `ticketing-data.ts`.

---

### DUP 5: `normalizePriority` defined in 3 places

- `src/components/ticketing/TicketContext.tsx` (line 209)
- `supabase/functions/ticket-ai-chat/index.ts` (line 214)
- Inline logic scattered elsewhere

Extract to `src/lib/utils.ts` on the frontend side.

---

### DUP 6: `getErrorMessage` / `getDisplayError` — same error extraction logic

- `TicketContext.tsx`: `getErrorMessage(error, fallback)`
- `ChatInterface.tsx`: `getDisplayError(error, fallback)`

Same implementation, different names. Extract to `src/lib/utils.ts`.

---

### DUP 7: `getReporterName` vs `getReporterNameFromAuthUser` — same logic

- `ChatInterface.tsx`: `getReporterName(user)` (line 196)
- `TicketContext.tsx`: `getReporterNameFromAuthUser(user)` (line 352)

Identical logic, different function names. Extract to `src/lib/utils.ts`.

---

### DUP 8: `slug` / `ticketSlug` utility defined twice

- `src/lib/routing-settings.ts`: `slug(value)` (line 82)
- `supabase/functions/ticket-ai-chat/index.ts`: `ticketSlug(value)` (line 225)

Same transformation (lowercase, non-alphanumeric → dash, trim dashes). Frontend copy goes in `src/lib/utils.ts`.

---

### DUP 9: `PLACEHOLDER_VALUE_PATTERN` regex defined in two places

- `src/lib/intake-rules.ts` (line 39)
- `supabase/functions/ticket-ai-chat/index.ts` (line 147)

Should be defined once in `src/lib/intake-rules.ts` and referenced from there. Edge function copy stays as-is (Deno).

---

### DUP 10: Dual Supabase clients pointing at the same database

- `src/lib/supabase.ts`: hardcoded URL and anon key, no auth persistence config
- `src/lib/backend-supabase.ts`: env-var-driven URL and anon key with full auth persistence config

`ChatInterface.tsx` imports `supabase` only to call `supabase.functions.invoke(...)`. This should use `backendSupabase` instead. `supabase.ts` becomes unused and can be removed, eliminating the hardcoded credentials from source code.

---

## Part 5 — Data / Schema Issues

### SCHEMA 1: Dual category naming system causes 24 overlapping categories

**File:** `src/lib/ticketing-data.ts` (lines 154–585)

`CATEGORIES` is a merge of `SPREADSHEET_CATEGORIES` (13 entries with legacy names like "Scheduling", "Studio Amenities and Facilities") and `LEGACY_CATEGORIES` (11 entries with newer names like "Booking & Schedule", "Facility & Equipment"). Both systems cover similar territory:

| Spreadsheet name | Legacy equivalent |
|---|---|
| Scheduling | Booking & Schedule |
| Studio Amenities and Facilities | Facility & Equipment |
| Pricing and Memberships | Billing & Membership |
| Safety and Security | Safety & Medical |
| Class Experience + Trainer Feedback | Instructor & Class Quality |

Having 24 categories when logically there are ~12-14 distinct areas confuses the AI (it must pick one of 24, and may pick the wrong naming variant) and confuses users.

**Fix:** Establish one canonical category set (the Legacy set is more specific and better structured). Keep the Spreadsheet categories mapped as aliases for backward compatibility with existing tickets, but don't show both sets in the picker. The category shown in the UI should use a curated list of ~14 categories. Old tickets with "Scheduling" still display correctly because their stored value is unchanged.

---

### SCHEMA 2: `SUPPLEMENTAL_EMPLOYEES` in routing-settings.ts are "ghost" employees

**File:** `src/lib/routing-settings.ts` (lines 144–148)

Three employees (Reyna, Saachi Jr., Jhanvi) are defined in `SUPPLEMENTAL_EMPLOYEES` but not in the main `ASSOCIATES` array in `ticketing-data.ts`. They appear in routing presets for Marketing. This means:
- `getEmployee('Reyna')` returns `undefined` (not found in ASSOCIATES)
- Escalation targets for these employees fall back to `'Admin Admin'` (the `REPORTING_HIERARCHY` default)
- Their SLA breaches trigger escalation to `'Admin Admin'` instead of a real person

**Fix:** Add these three employees to `ASSOCIATES` in `ticketing-data.ts` with correct manager/team values, or remove them from routing presets and replace with actual ASSOCIATES entries.

---

### SCHEMA 3: Hardcoded credentials in `supabase.ts`

**File:** `src/lib/supabase.ts`

The Supabase URL and anon key are hardcoded strings. While anon keys are client-safe by design, hardcoding them in source code is a bad practice (they appear in git history, can't be rotated without code changes).

**Fix:** Move to environment variables using `import.meta.env.VITE_SUPABASE_URL` and `import.meta.env.VITE_SUPABASE_ANON_KEY`. Once `ChatInterface.tsx` is migrated to use `backendSupabase`, `supabase.ts` can be deleted entirely.

---

## Part 6 — Proposed Prioritised Implementation Order

The fixes are grouped by risk and impact. All changes should go through review before deploy. No existing behaviour should change unless noted.

---

### Phase 1 — Critical (do first, high impact, contained changes)

**P1-A: Fix AI asking for irrelevant entity fields** *(1–2 hours)*
- **File:** `supabase/functions/ticket-ai-chat/index.ts`
- Add `filterAiDetailFormFields()` function (described in Part 1)
- After computing `guardedMissingFields`, call `filterAiDetailFormFields(aiResponse.detailForm, guardedMissingFields)` and use the result instead of raw `aiResponse.detailForm`
- No frontend changes required
- Test: send "washing machine not working", "AC not cold", "lights flickering" — verify no member/class fields appear

**P1-B: Fix Legacy SLA freeze running on new devices** *(2–3 hours)*
- **File:** `src/components/ticketing/TicketContext.tsx`
- Remove the `LEGACY_SLA_DISABLE_MARKER_KEY` useEffect entirely (lines 875–896)
- Create a Supabase SQL migration that sets `sla_due_at` correctly for old "legacy" tickets (those with `tags @> ARRAY['historic']` or tickets created before a specific cutoff date)
- Add the migration as `supabase/legacy_sla_freeze.sql`

**P1-C: Remove backend `ATHENA_SYSTEM_PROMPT` and make the backend authoritative for the prompt** *(1 hour)*
- **File:** `supabase/functions/ticket-ai-chat/index.ts` — keep only one `ATHENA_SYSTEM_PROMPT` here, use it as the sole source of truth
- **File:** `src/components/ticketing/ChatInterface.tsx` — remove `ATHENA_SYSTEM_PROMPT` constant and the `instructions` field from the API request body
- This prevents prompt injection from the client and removes the "two prompts" confusion

---

### Phase 2 — High (routing correctness, data integrity)

**P2-A: Reconcile ASSIGNMENT_RULES between edge function and frontend** *(1 hour)*
- **File:** `supabase/functions/ticket-ai-chat/index.ts`
- Remove the local `ASSIGNMENT_RULES` constant (it conflicts with `ticketing-data.ts`)
- Remove `resolveAssignment()` function
- Instead, drive assignment from the `issue_routing_rules` table (which the edge function already queries as part of `masterData` sent by the frontend) — or for simplicity, keep the `resolveAssignment` function but align its return values with `ticketing-data.ts`'s `ASSIGNMENT_RULES`
- Specific fixes: `Safety & Medical` → `Saachi Shetty - Operations`, `Front Desk & Service` → `Nunu Yeptomi`

**P2-B: Fix `subCategory` dropdown showing all 350+ options** *(30 min)*
- **File:** `src/components/ticketing/ChatInterface.tsx`
- In `normalizeDetailForm`, when mapping field id `subCategory`, dynamically set `options` based on the current context category:
  ```typescript
  options: ctx?.category ? (CATEGORIES[ctx.category] || []) : Object.values(CATEGORIES).flat()
  ```
- Pass the current context to `normalizeDetailForm` as an optional parameter

**P2-C: Migrate `ChatInterface.tsx` from `supabase` to `backendSupabase`** *(30 min)*
- Replace `supabase.functions.invoke(...)` with `backendSupabase.functions.invoke(...)`
- Remove `import { supabase } from '@/lib/supabase'` from ChatInterface
- Verify `backendSupabase` is configured to reach the same Edge Functions endpoint

**P2-D: Add `SUPPLEMENTAL_EMPLOYEES` to `ASSOCIATES`** *(30 min)*
- **File:** `src/lib/ticketing-data.ts`
- Add Reyna, Saachi Jr., Jhanvi as proper entries in the ASSOCIATES array with correct roles, teams, and manager values
- Remove `SUPPLEMENTAL_EMPLOYEES` from `routing-settings.ts` (no longer needed since they're now in ASSOCIATES)

---

### Phase 3 — Medium (code quality, DRY cleanup)

**P3-A: Extract shared utilities to `src/lib/utils.ts`** *(1–2 hours)*
- `normalizePriority(value)` — single canonical implementation
- `getReporterName(user)` — replaces both `getReporterName` (ChatInterface) and `getReporterNameFromAuthUser` (TicketContext)
- `getErrorMessage(error, fallback)` — replaces both `getDisplayError` and `getErrorMessage` implementations
- `buildSourceRef(draft, context, conversationId)` — replaces both TicketContext and edge function copies (edge function keeps its own copy but they are kept in sync)
- `slug(value)` — canonical slug utility
- Update all callers to import from `src/lib/utils.ts`

**P3-B: Remove dead code** *(30 min)*
- **`TicketContext.tsx`:** Remove `extractCreatedTicket` (lines 380–414) and `extractCreatedTicketId` (lines 416–439) — both are defined but never called
- **`ticket-ai-chat/index.ts`:** Remove `needsStructuredDetails` alias (lines 741–743) — inline the call directly to `requiredFieldsForIssue`
- **`TicketContext.tsx`:** Remove `resolveTeam` wrapper (lines 480–482) and replace calls with direct `resolveTicketDepartment(category, assignedTo)` calls

**P3-C: Consolidate the two inference functions** *(1 hour)*
- `inferContextFromText` (edge function) and `inferIntakeContextFromText` (intake-rules.ts) should produce identical output for the same input
- Align all regex patterns — `intake-rules.ts` should be the source of truth
- Edge function copy should include a comment: `// Mirror of src/lib/intake-rules.ts inferIntakeContextFromText — keep in sync`

**P3-D: Add mirror comments to unavoidably duplicated code** *(15 min)*
- `isBengaluruStudio` / `isBandraStudio` in edge function — add comment linking to `ticketing-data.ts`
- `PRIORITY_SLA_HOURS` in edge function — add comment linking to `PRIORITY_SLA` in `ticketing-data.ts`
- `PLACEHOLDER_VALUE_PATTERN` in edge function — add comment linking to `intake-rules.ts`
- `getMissingColumnName` / `removeUnsupportedTicketColumn` in edge function — add comment linking to `TicketContext.tsx` (or move to a shared utils module if monorepo structure permits it)

---

### Phase 4 — Low / Strategic (architectural improvements)

**P4-A: Delete `src/lib/supabase.ts` and hardcoded credentials** *(30 min)*
- After P2-C is complete and `supabase` is no longer imported anywhere, delete `src/lib/supabase.ts`
- Verify `momence-api.ts` is the only other importer — update it to use `backendSupabase` or a Supabase functions call

**P4-B: Rationalise the dual category naming system** *(half-day, requires stakeholder input)*
- Decide on one canonical category list (~14 entries from LEGACY_CATEGORIES is recommended)
- Keep SPREADSHEET_CATEGORIES as internal aliases only, not shown in the UI
- Update `CATEGORIES` export to only include the canonical list for the picker
- Existing tickets that used spreadsheet category names continue to display correctly (stored values unchanged)
- Update `ASSIGNMENT_RULES` to only reference the canonical names

**P4-C: `galleryImages.ts` — evaluate necessity** *(5 min)*
- `src/lib/galleryImages.ts` only exports `ROBOT_SPLINE_URL`. Either inline this constant at its two use sites or keep it but rename to `src/lib/constants.ts` and merge any other loose constants into it.

---

## Summary Table

| ID | Severity | File(s) | Issue | Phase |
|---|---|---|---|---|
| P1-A | **Critical** | `ticket-ai-chat/index.ts` | AI asks for member/class fields for facility issues | 1 |
| P1-B | **Critical** | `TicketContext.tsx` | Legacy SLA freeze corrupts tickets on new device login | 1 |
| P1-C | High | `ticket-ai-chat/index.ts`, `ChatInterface.tsx` | Dual ATHENA prompts — backend one is dead code, client prompt is injectable | 1 |
| P2-A | High | `ticket-ai-chat/index.ts`, `ticketing-data.ts` | Conflicting ASSIGNMENT_RULES produce different owners for same ticket | 2 |
| P2-B | High | `ChatInterface.tsx` | subCategory dropdown shows 350+ options unfiltered | 2 |
| P2-C | Medium | `ChatInterface.tsx`, `supabase.ts` | Hardcoded credentials in `supabase.ts`, redundant dual client | 2 |
| P2-D | Medium | `ticketing-data.ts`, `routing-settings.ts` | 3 ghost employees not in ASSOCIATES — escalation falls to "Admin Admin" | 2 |
| P3-A | Medium | Multiple | Duplicate utility functions scattered across 4+ files | 3 |
| P3-B | Low | `TicketContext.tsx`, `ticket-ai-chat/index.ts` | Dead code: `extractCreatedTicket`, `extractCreatedTicketId`, `needsStructuredDetails`, `resolveTeam` | 3 |
| P3-C | Medium | `ticket-ai-chat/index.ts`, `intake-rules.ts` | Divergent inference functions can classify same text differently | 3 |
| P3-D | Low | Multiple | Unavoidably duplicated cross-boundary code needs sync comments | 3 |
| P4-A | Low | `supabase.ts` | Delete file after P2-C | 4 |
| P4-B | Low | `ticketing-data.ts` | 24-category dual naming system is confusing for AI and users | 4 |
| P4-C | Low | `galleryImages.ts` | Trivial single-export module | 4 |

---

## Files Requiring Changes by Phase

### Phase 1
- `supabase/functions/ticket-ai-chat/index.ts` (P1-A, P1-C)
- `src/components/ticketing/ChatInterface.tsx` (P1-C)
- `src/components/ticketing/TicketContext.tsx` (P1-B)
- New: `supabase/legacy_sla_freeze.sql` (P1-B)

### Phase 2
- `supabase/functions/ticket-ai-chat/index.ts` (P2-A)
- `src/lib/ticketing-data.ts` (P2-A, P2-D)
- `src/components/ticketing/ChatInterface.tsx` (P2-B, P2-C)
- `src/lib/routing-settings.ts` (P2-D)

### Phase 3
- `src/lib/utils.ts` — new or extended (P3-A)
- `src/components/ticketing/TicketContext.tsx` (P3-A, P3-B)
- `src/components/ticketing/ChatInterface.tsx` (P3-A)
- `supabase/functions/ticket-ai-chat/index.ts` (P3-B, P3-C, P3-D)
- `src/lib/intake-rules.ts` (P3-C)

### Phase 4
- `src/lib/supabase.ts` — delete (P4-A)
- `src/lib/ticketing-data.ts` (P4-B)
- `src/lib/galleryImages.ts` or `src/lib/constants.ts` (P4-C)

---

*End of audit. No changes have been made to any file. Implement phases in order to avoid introducing new breakage.*
