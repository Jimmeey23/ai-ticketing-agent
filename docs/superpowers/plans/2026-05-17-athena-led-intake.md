# Athena-Led Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the route-first intake gate with a free-text-first Athena workflow that infers classification, urgency, and priority, asks only for missing details, and auto-sets `reportedBy` from the signed-in user.

**Architecture:** Keep the existing React/Supabase response contract, but add inferred-context normalization around it. Make `src/lib/intake-rules.ts` the publishability gate, update `ChatInterface.tsx` to seed auth context and remove the hard route/category gate, and align the edge function fallback with Athena-led classification.

**Tech Stack:** Vite, React 18, TypeScript, Vitest, Supabase Edge Functions, existing shadcn/Radix components.

---

## File Structure

- Modify `src/lib/intake-rules.ts`: add `urgencyReason`, support auth-owned `reportedBy`, keep placeholder handling, and expose inferred-context field names.
- Modify `src/lib/intake-rules.test.ts`: update current reported-by expectations and add free-text/inferred publishability tests.
- Modify `src/contexts/BackendAuthContext.tsx`: export a helper-compatible user display shape through the existing hook only; no schema change.
- Modify `src/components/ticketing/ChatInterface.tsx`: remove the route/category fast gate, seed `reportedBy` from auth, normalize AI-inferred route/category/subcategory/priority/urgency back into context, and keep drafts suppressed until publishable.
- Modify `src/components/ticketing/ContextPicker.tsx`: remove the manual `reportedBy` picker.
- Modify `supabase/functions/ticket-ai-chat/index.ts`: update prompt and fallback to infer classification/urgency before asking missing details.
- Modify `scripts/check-intake-flow.mjs`: guard against reintroducing the route-first fast gate and manual reported-by requirement.

## Task 0: Git And Baseline Verification

**Files:**
- Inspect only: repository state

- [ ] **Step 1: Verify Git is project-local and healthy**

Run:

```bash
git rev-parse --show-toplevel
git status --short
```

Expected:

```text
/Users/jimmeeygondaa/AI Ticketing Agent
```

`git status --short` should not print `fatal: bad object HEAD`. It may show many untracked files because this project-local repository was newly initialized after the parent repo corruption was discovered.

- [ ] **Step 2: Run baseline tests**

Run:

```bash
npm run test -- src/lib/intake-rules.test.ts
node scripts/check-intake-flow.mjs
```

Expected: current tests and regression script pass before behavior changes. If they fail, record the exact failing assertion before editing.

## Task 1: Update Intake Rules For Auth-Owned Reported By

**Files:**
- Modify: `src/lib/intake-rules.ts`
- Modify: `src/lib/intake-rules.test.ts`

- [ ] **Step 1: Write failing tests for auth-owned `reportedBy` and urgency context**

In `src/lib/intake-rules.test.ts`, update the imports to keep `IntakeContext`, then add these tests inside the existing `describe` block:

```ts
  it('does not ask for reportedBy when auth has supplied a real user', () => {
    const context: IntakeContext = {
      intakeRoute: 'Complaint',
      category: 'Customer Service and Communication',
      subCategory: 'Delay in Response',
      memberId: 'mom_123',
      desiredResolution: 'Member requested a written update.',
      memberSentiment: 'Member Expressed Dissatisfaction',
      reportedBy: 'frontdesk@physique57india.com',
      priority: 'High',
      urgencyReason: 'Member described an unresolved delay affecting renewal confidence.',
      description: 'Member reported that her WhatsApp query was not answered for two days.',
    };

    expect(getMissingIntakeFields(context)).toEqual([]);
    expect(isIntakePublishable(context)).toBe(true);
  });

  it('still treats AI Intake and empty auth fallbacks as missing reportedBy values', () => {
    const base: IntakeContext = {
      intakeRoute: 'Feedback',
      category: 'General Feedback',
      subCategory: 'Suggestion',
      priority: 'Low',
      description: 'Member suggested adding more weekend recovery sessions.',
    };

    expect(getMissingIntakeFields({ ...base, reportedBy: 'AI Intake' })).toContain('reportedBy');
    expect(getMissingIntakeFields({ ...base, reportedBy: 'Authenticated user' })).toContain('reportedBy');
    expect(getMissingIntakeFields({ ...base, reportedBy: 'ops@physique57india.com' })).not.toContain('reportedBy');
  });
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```bash
npm run test -- src/lib/intake-rules.test.ts
```

Expected: FAIL because `urgencyReason` is not typed yet and `Authenticated user` is not treated as a placeholder.

- [ ] **Step 3: Update the intake context and placeholder semantics**

In `src/lib/intake-rules.ts`, add `urgencyReason` to `IntakeContext`:

```ts
  urgencyReason?: string;
```

Update `PLACEHOLDER_VALUE_PATTERN` to include the auth fallback:

```ts
const PLACEHOLDER_VALUE_PATTERN = /unspecified|not specified|member-reported issue|ai intake|authenticated user/i;
```

Do not remove `reportedBy` from `getMissingIntakeFields`; it remains required, but the UI will supply it from auth.

- [ ] **Step 4: Run the focused test and verify pass**

Run:

```bash
npm run test -- src/lib/intake-rules.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the intake-rule change**

Run:

```bash
git add src/lib/intake-rules.ts src/lib/intake-rules.test.ts
git commit -m "test: cover auth-owned intake reporter"
```

If the repository still has many unrelated untracked files, this commit should include only the two listed files.

## Task 2: Seed `reportedBy` From The Signed-In User

**Files:**
- Modify: `src/components/ticketing/ChatInterface.tsx`
- Modify: `src/components/ticketing/ContextPicker.tsx`

- [ ] **Step 1: Add the auth import and display-name helper**

In `src/components/ticketing/ChatInterface.tsx`, add this import:

```ts
import { useBackendAuth } from '@/contexts/BackendAuthContext';
```

Near `getDisplayError`, add:

```ts
function getReporterName(user: ReturnType<typeof useBackendAuth>['user']): string {
  const metadata = user?.user_metadata || {};
  const fullName = typeof metadata.full_name === 'string' ? metadata.full_name.trim() : '';
  const name = typeof metadata.name === 'string' ? metadata.name.trim() : '';
  return fullName || name || user?.email || 'Authenticated user';
}
```

- [ ] **Step 2: Seed context and keep it synced**

Inside `ChatInterface`, after `const { createApprovedTicket } = useTickets();`, add:

```ts
  const { user } = useBackendAuth();
  const reporterName = getReporterName(user);
```

Add this effect after the existing refs:

```ts
  useEffect(() => {
    setContext((current) => {
      if (current.reportedBy === reporterName) return current;
      return { ...current, reportedBy: reporterName };
    });
  }, [reporterName]);
```

Update `resetChat` so reset keeps auth-owned reporter:

```ts
  const resetChat = () => {
    setMessages([GREETING]);
    setContext({ reportedBy: reporterName });
    setPendingSingleField(null);
    setConversationId(null);
    setLoading(false);
  };
```

- [ ] **Step 3: Remove manual reported-by field rendering**

In `src/components/ticketing/ContextPicker.tsx`, remove `ASSOCIATES` from the import:

```ts
import { STUDIOS, TRAINERS, CLASS_TYPES, CATEGORIES, MEMBERSHIPS } from '@/lib/ticketing-data';
```

Remove `UserCircle` from the lucide import list.

Delete the final `Picker` block whose label is `Reported by`.

Keep `reportedBy?: string;` in the exported `Context` interface because it still travels through context.

- [ ] **Step 4: Run TypeScript build**

Run:

```bash
npm run build
```

Expected: PASS. If TypeScript complains about `ReturnType<typeof useBackendAuth>`, replace the helper signature with:

```ts
function getReporterName(user: { email?: string; user_metadata?: Record<string, unknown> } | null): string {
```

- [ ] **Step 5: Commit auth-owned reporter UI change**

Run:

```bash
git add src/components/ticketing/ChatInterface.tsx src/components/ticketing/ContextPicker.tsx
git commit -m "feat: auto-set intake reporter from auth"
```

## Task 3: Remove Route-First Gate And Normalize Athena Inference

**Files:**
- Modify: `src/components/ticketing/ChatInterface.tsx`

- [ ] **Step 1: Extend AI response typing**

In `src/components/ticketing/ChatInterface.tsx`, add:

```ts
interface AiIntakeResponse {
  conversationId?: string;
  needsMoreInfo?: boolean;
  reply?: string;
  detailForm?: DetailForm | null;
  ticket?: DraftTicket | null;
  suggestedChips?: SuggestedChip[];
  inferredContext?: Partial<DetailContext>;
  missingFields?: string[];
  publishable?: boolean;
  urgencyReason?: string;
}
```

Use it on the Supabase invoke result:

```ts
      const { data, error } = await supabase.functions.invoke<AiIntakeResponse>('ticket-ai-chat', {
```

- [ ] **Step 2: Add a safe inferred-context merge helper**

Near `applyDetailValue`, add:

```ts
function normalizeInferredContext(input: unknown): Partial<DetailContext> {
  if (!input || typeof input !== 'object') return {};
  const value = input as Record<string, unknown>;
  const next: Partial<DetailContext> = {};
  const assignString = (key: keyof DetailContext) => {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) next[key] = candidate.trim();
  };

  assignString('intakeRoute');
  assignString('requestType');
  assignString('category');
  assignString('subCategory');
  assignString('priority');
  assignString('memberSentiment');
  assignString('desiredResolution');
  assignString('urgencyReason');

  return next;
}
```

Add this helper below it:

```ts
function mergeInferredContext(ctx: DetailContext, inferred: Partial<DetailContext>, fallbackUrgency?: string): DetailContext {
  const next = { ...ctx };
  for (const [key, value] of Object.entries(inferred)) {
    if (!value) continue;
    if (key === 'category' && next.category !== value) {
      next.category = value;
      next.subCategory = undefined;
      continue;
    }
    next[key] = value;
  }
  if (fallbackUrgency && !next.urgencyReason) next.urgencyReason = fallbackUrgency;
  return next;
}
```

- [ ] **Step 3: Remove the hard fast gate from send flow**

In `sendMessage`, delete this block:

```ts
      const localGateForm = pruneDetailForm(fastGateForm(activeContext), activeContext);
      if (localGateForm) {
        setPendingSingleField(null);
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: 'Please complete the required intake fields below before Athena drafts the ticket.',
            suggestedChips: [],
            detailForm: localGateForm,
            published: false,
            ticketId: undefined,
          },
        ]);
        return;
      }
```

Leave `fastGateForm` defined for now only if another task still references it. If no references remain, delete the `fastGateForm` function.

- [ ] **Step 4: Merge AI inference before missing-field calculation**

After conversation id handling, add:

```ts
      const inferredContext = normalizeInferredContext(data?.inferredContext);
      let responseContext = mergeInferredContext(activeContext, inferredContext, data?.urgencyReason);
      if (Object.keys(inferredContext).length > 0 || data?.urgencyReason) {
        responseContext = { ...responseContext, reportedBy: reporterName };
        activeContext = responseContext;
        setContext(responseContext);
      }
```

Then replace later references in the response handling block from `activeContext` to `responseContext` for:

```ts
detailFormForIncompleteDraft(data?.ticket, responseContext)
normalizeDetailForm(data?.detailForm)
detailFormForContext(responseContext)
buildClientDraft(responseContext, text)
detailFormFromQuestionText(data?.reply || '', responseContext)
```

- [ ] **Step 5: Keep draft suppression based on final missing fields**

Replace the `ticket` calculation with:

```ts
      const remainingMissingFields = getMissingIntakeFields(responseContext);
      const ticket = finalDetailForm || data?.needsMoreInfo || remainingMissingFields.length > 0
        ? null
        : data?.ticket || buildClientDraft(responseContext, text);
```

If `finalDetailForm` is declared after `ticket` in the current code, reorder the local variables so `finalDetailForm` is computed first:

```ts
      const parsedQuestionForm = !detailForm && !data?.ticket
        ? pruneDetailForm(detailFormFromQuestionText(data?.reply || '', responseContext), responseContext)
        : null;
      const finalDetailForm = detailForm || parsedQuestionForm;
      const remainingMissingFields = getMissingIntakeFields(responseContext);
      const ticket = finalDetailForm || data?.needsMoreInfo || remainingMissingFields.length > 0
        ? null
        : data?.ticket || buildClientDraft(responseContext, text);
```

- [ ] **Step 6: Run regression checks**

Run:

```bash
npm run test -- src/lib/intake-rules.test.ts
node scripts/check-intake-flow.mjs
npm run build
```

Expected: all pass.

- [ ] **Step 7: Commit route-first removal**

Run:

```bash
git add src/components/ticketing/ChatInterface.tsx
git commit -m "feat: let Athena infer intake classification"
```

## Task 4: Align Edge Function Prompt And Fallback

**Files:**
- Modify: `supabase/functions/ticket-ai-chat/index.ts`

- [ ] **Step 1: Update prompt rules**

In `ATHENA_SYSTEM_PROMPT`, replace the route/category-first rules with:

```ts
Behavior rules:
- Start from the internal team member's free-text documentation of member voice.
- Infer exactly one intake route: Request, Complaint, Feedback, or Internal Reporting.
- Infer the best category and subcategory from the approved master data. Do not require the user to manually select them before asking issue-specific details.
- Infer priority and include a short urgency reason based on member impact, safety risk, retention risk, billing urgency, and escalation language.
- Ask only for operational details that are missing after inference.
- Do not draft a ticket until all required fields are available.
- Do not ask multiple prose questions. Return a structured detailForm with full field definitions when multiple details are missing; ask only one concise question when exactly one detail is missing.
- Use date fields for dates and datetime-local fields for date/time fields.
- Use only approved master-data options for studios, instructors, class types, categories, subcategories, priorities, associates, and route buttons.
- Member and class/session details are selected through Momence-powered UI fields, not ordinary text boxes when a structured form is shown.
- For freeze, rollover, membership, and package-specific requests, require a selected member first and then use only that member's active memberships.
- Write ticket content in third-person internal documentation language, focused on what the community member stated.
- Ticket creation happens only after explicit approval of the displayed draft.
```

- [ ] **Step 2: Add inferred context to AI response type**

Update `AiIntakeResponse`:

```ts
type AiIntakeResponse = {
  needsMoreInfo: boolean;
  reply: string;
  detailForm?: AiDetailForm | null;
  ticket?: DraftTicket | null;
  suggestedChips?: Array<{ label: string; value: string; field: string }>;
  inferredContext?: Record<string, string>;
  missingFields?: string[];
  publishable?: boolean;
  urgencyReason?: string;
};
```

Update `normalizeAiIntakeResponse` to include:

```ts
    inferredContext: value.inferredContext && typeof value.inferredContext === 'object'
      ? value.inferredContext as Record<string, string>
      : {},
    missingFields: Array.isArray(value.missingFields) ? value.missingFields.map(String) : [],
    publishable: typeof value.publishable === 'boolean' ? value.publishable : !Boolean(value.needsMoreInfo || detailForm),
    urgencyReason: cleanString(value.urgencyReason),
```

- [ ] **Step 3: Update JSON schema instruction**

In `askAiForIntake`, replace the schema sentence with:

```ts
'{"needsMoreInfo": boolean, "reply": string, "inferredContext": {"intakeRoute": string, "category": string, "subCategory": string, "priority": string, "memberSentiment": string, "desiredResolution": string}, "urgencyReason": string, "missingFields": string[], "publishable": boolean, "detailForm": {"title": string, "description": string, "fields": [{"id": string, "label": string, "type": "select|text|textarea|date|datetime-local|number", "required": boolean, "options": string[]}], "submitLabel": string}, "ticket": DraftTicket|null, "suggestedChips": []}',
```

Replace:

```ts
'If category or subCategory is missing, ask only for those master-data fields before issue-specific fields.',
```

with:

```ts
'Infer category and subCategory from member voice whenever possible. Ask for category or subCategory only when the text is genuinely ambiguous after using the approved master data.',
```

- [ ] **Step 4: Add fallback inference helper**

Add this function above `requiredFieldsForIssue`:

```ts
function inferContextFromText(text: string, context: Record<string, unknown> = {}): Record<string, string> {
  const lower = `${text} ${cleanString(context.requestType)} ${cleanString(context.category)} ${cleanString(context.subCategory)}`.toLowerCase();
  const inferred: Record<string, string> = {};

  if (!cleanString(context.intakeRoute)) {
    if (/refund|freeze|roll|extension|reschedule|request|need|asked|wants|would like/.test(lower)) inferred.intakeRoute = 'Request';
    else if (/complain|angry|frustrated|unhappy|not resolved|delay|issue|problem|concern/.test(lower)) inferred.intakeRoute = 'Complaint';
    else if (/reported|feedback|suggested|said|shared|mentioned|compliment|liked|loved/.test(lower)) inferred.intakeRoute = 'Feedback';
    else inferred.intakeRoute = 'Internal Reporting';
  }

  if (!cleanString(context.category)) {
    if (/billing|refund|payment|freeze|roll over|rollover|extension|membership|package|renewal|expiry|credit/.test(lower)) {
      inferred.category = 'Pricing and Memberships';
      inferred.subCategory = /freeze|pause/.test(lower) ? 'Membership Pause and Freeze Policy' : /refund/.test(lower) ? 'Refund and Cancellation Policy Issue' : 'Class Pack Expiry Confusion';
    } else if (/hosted|partner|influencer|partnership/.test(lower)) {
      inferred.category = 'Hosted Class & Partnerships';
      inferred.subCategory = 'Hosted Class Feedback';
    } else if (/equipment|ac|temperature|locker|clean|odour|audio|lighting|washroom|shower/.test(lower)) {
      inferred.category = 'Studio Amenities and Facilities';
      inferred.subCategory = /temperature|ac/.test(lower) ? 'Air Quality Poor' : /clean|hygiene/.test(lower) ? 'Cleanliness and Hygiene' : 'Studio Odour and Aroma';
    } else if (/injury|safety|medical|harassment|security|theft|stolen/.test(lower)) {
      inferred.category = 'Safety and Security';
      inferred.subCategory = /theft|stolen/.test(lower) ? 'Theft Prevention Measures' : 'Personal Safety Concerns';
    } else if (/trainer|instructor|class|music|cue|correction|adjustment|overcrowded/.test(lower)) {
      inferred.category = 'Class Experience';
      inferred.subCategory = /overcrowd|capacity/.test(lower) ? 'Overcrowding in Class' : /audio|music/.test(lower) ? 'Audio Issues' : 'Class Flow and Pacing';
    } else if (/whatsapp|call|email|response|follow-up|front desk|communication/.test(lower)) {
      inferred.category = 'Customer Service and Communication';
      inferred.subCategory = 'Delay in Response';
    } else {
      inferred.category = 'General Feedback';
      inferred.subCategory = 'Other';
    }
  }

  if (!cleanString(context.priority)) {
    if (/injury|medical|harassment|security|theft|stolen|unsafe|emergency/.test(lower)) inferred.priority = 'Critical';
    else if (/angry|frustrated|urgent|refund|not resolved|escalat|renewal|cancel/.test(lower)) inferred.priority = 'High';
    else if (/complain|issue|concern|delay|request/.test(lower)) inferred.priority = 'Medium';
    else inferred.priority = 'Low';
  }

  return inferred;
}
```

- [ ] **Step 5: Use fallback inference before missing-field checks**

Before calling `needsStructuredDetails`, add:

```ts
    const inferredContext = inferContextFromText(latestUserMessage, body.context || {});
    const effectiveContext = { ...(body.context || {}), ...inferredContext };
```

Then replace:

```ts
const missingFields = needsStructuredDetails(latestUserMessage, body.context || {});
```

with:

```ts
const missingFields = needsStructuredDetails(latestUserMessage, effectiveContext);
```

In the missing-fields JSON response, add:

```ts
        inferredContext,
        missingFields,
        publishable: false,
        urgencyReason: inferredContext.priority
          ? `Fallback priority inferred as ${inferredContext.priority} from the documented member voice.`
          : '',
```

When returning an AI response, pass through the new fields:

```ts
        inferredContext: aiResponse.inferredContext || {},
        missingFields: aiResponse.missingFields || [],
        publishable: aiResponse.publishable === true,
        urgencyReason: aiResponse.urgencyReason || '',
```

- [ ] **Step 6: Run build**

Run:

```bash
npm run build
```

Expected: PASS. The Supabase edge function is Deno TypeScript and is not compiled by Vite; this step verifies frontend compatibility only.

- [ ] **Step 7: Commit edge alignment**

Run:

```bash
git add supabase/functions/ticket-ai-chat/index.ts
git commit -m "feat: infer ticket classification in intake function"
```

## Task 5: Strengthen Regression Guard

**Files:**
- Modify: `scripts/check-intake-flow.mjs`

- [ ] **Step 1: Add route-first and manual reporter reintroduction checks**

In `scripts/check-intake-flow.mjs`, add these checks after the existing `rejectPattern` checks:

```js
rejectPattern(
  /fastGateForm\(activeContext\)/,
  'Intake regression: ChatInterface must not require route/category selection before Athena inference.'
);

rejectPattern(
  /label=["']Reported by["']|label=\{["']Reported by["']\}/,
  'Intake regression: reportedBy must be supplied from auth, not selected manually in the intake flow.'
);

requirePattern(
  /useBackendAuth\(\)[\s\S]*reportedBy:\s*reporterName/,
  'Intake regression: ChatInterface must seed reportedBy from the signed-in user.'
);
```

- [ ] **Step 2: Run regression script and fix pattern drift if needed**

Run:

```bash
node scripts/check-intake-flow.mjs
```

Expected: `Intake flow regression checks passed.`

If the `useBackendAuth` regex is too brittle after implementation, replace it with two simpler checks:

```js
requirePattern(/useBackendAuth\(\)/, 'Intake regression: ChatInterface must read the signed-in user.');
requirePattern(/reportedBy:\s*reporterName/, 'Intake regression: ChatInterface must seed reportedBy from auth.');
```

- [ ] **Step 3: Commit regression guard**

Run:

```bash
git add scripts/check-intake-flow.mjs
git commit -m "test: guard athena-led intake flow"
```

## Task 6: Final Verification

**Files:**
- Verify only

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm run test -- src/lib/intake-rules.test.ts
node scripts/check-intake-flow.mjs
```

Expected: both pass.

- [ ] **Step 2: Run full build**

Run:

```bash
npm run build
```

Expected: Vite build completes successfully.

- [ ] **Step 3: Inspect final Git status**

Run:

```bash
git status --short
```

Expected: only unrelated untracked baseline project files may remain because the repo was initialized during this session. No modified files from this plan should be left uncommitted.

- [ ] **Step 4: Manual smoke path**

Run the app:

```bash
npm run dev
```

Open the local Vite URL and test this path:

```text
Member said the Bandra class was overcrowded and she wants someone to call before renewing.
```

Expected:

- Athena does not first ask the user to choose route/category/subcategory.
- Athena infers complaint or feedback route, class/studio category, subcategory, and a medium or high priority.
- `Documented by` is populated from the signed-in user.
- Athena asks only for missing member/session/resolution details.
- No ticket draft appears until required fields are complete.

