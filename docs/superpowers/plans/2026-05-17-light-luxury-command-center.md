# Light Luxury Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved light luxury Concierge Split command center and make Athena capture required ticket information before showing a draft.

**Architecture:** Extract intake publishability into a testable helper, then reuse it in the chat UI and intelligence panel. Keep the current Supabase schema and edge-function response contract, but replace the chat-only screen with a three-panel responsive command center using the approved white, ivory, graphite, and champagne visual system.

**Tech Stack:** Vite, React 18, TypeScript, Tailwind CSS, shadcn/Radix primitives, Supabase, Vitest for helper tests, Browser plugin for rendered QA.

---

## File Structure

- Create `src/lib/intake-rules.ts`: single source of truth for missing-field and publishability checks.
- Create `src/lib/intake-rules.test.ts`: Vitest coverage for placeholder values, route/category gates, member-facing requirements, and publishable contexts.
- Modify `package.json`: add `test` script and Vitest dev dependencies.
- Modify `src/index.css`: add light luxury design tokens and reusable utility classes.
- Modify `src/components/AppLayout.tsx`: lazy-load dashboard and update global shell styling.
- Create `src/components/ticketing/CommandCenterShell.tsx`: three-panel command-center layout around the existing intake workflow.
- Create `src/components/ticketing/IntakeRail.tsx`: route/context rail with Momence/context controls.
- Create `src/components/ticketing/TicketIntelligencePanel.tsx`: missing-field, SLA, owner, priority, and publish-readiness panel.
- Modify `src/components/ticketing/ChatInterface.tsx`: consume extracted rules and render inside the new command-center shell.
- Modify `src/components/ticketing/TicketPreviewCard.tsx`: light luxury draft review styling.
- Modify `src/components/ticketing/QuickTemplates.tsx`: align route cards with the new palette.
- Modify `supabase/functions/ticket-ai-chat/index.ts`: keep fallback missing-field logic aligned with extracted frontend behavior.
- Modify `scripts/check-intake-flow.mjs`: keep the existing no-early-draft regression guard.

## Task 0: Preflight And Test Harness

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Check Git health before committing**

Run:

```bash
git rev-parse --is-inside-work-tree
git status --short
```

Expected if Git is healthy:

```text
true
```

If `git status --short` prints `fatal: bad object HEAD`, do not run `git add` or `git commit` in later steps. Continue implementation and record Git as a completion blocker.

- [ ] **Step 2: Add Vitest dependencies**

Run:

```bash
npm install -D vitest jsdom @testing-library/react @testing-library/user-event
```

Expected: `package.json` and `package-lock.json` update with the new dev dependencies.

- [ ] **Step 3: Add test scripts**

Update `package.json` scripts to include:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "build:dev": "vite build --mode development",
    "lint": "eslint .",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 4: Verify the empty test harness**

Run:

```bash
npm run test -- --passWithNoTests
```

Expected: Vitest exits successfully with no test files or with existing tests passing.

- [ ] **Step 5: Commit if Git is healthy**

Run only if `git status --short` works:

```bash
git add package.json package-lock.json
git commit -m "chore: add frontend test harness"
```

## Task 1: Extract Intake Publishability Rules

**Files:**
- Create: `src/lib/intake-rules.ts`
- Create: `src/lib/intake-rules.test.ts`
- Modify: `scripts/check-intake-flow.mjs`

- [ ] **Step 1: Write failing publishability tests**

Create `src/lib/intake-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  captureMemberVoiceFromText,
  getMissingIntakeFields,
  isIntakePublishable,
  isMissingIntakeValue,
} from './intake-rules';

describe('intake publishability rules', () => {
  it('requires route, category, subcategory, member voice, and documented-by before draft review', () => {
    expect(getMissingIntakeFields({})).toEqual([
      'intakeRoute',
      'category',
      'subCategory',
    ]);

    expect(
      getMissingIntakeFields({
        intakeRoute: 'Complaint',
        category: 'Customer Service and Communication',
        subCategory: 'Delay in Response',
      })
    ).toEqual(['memberName', 'desiredResolution', 'memberSentiment', 'reportedBy', 'priority', 'description']);
  });

  it('treats operational placeholders as missing values', () => {
    expect(isMissingIntakeValue('Unspecified Studio')).toBe(true);
    expect(isMissingIntakeValue('Member-reported issue')).toBe(true);
    expect(isMissingIntakeValue('AI Intake')).toBe(true);
    expect(isMissingIntakeValue('Kwality House, Kemps Corner')).toBe(false);
  });

  it('marks a complete member-facing complaint as publishable', () => {
    const context = {
      intakeRoute: 'Complaint',
      category: 'Customer Service and Communication',
      subCategory: 'Delay in Response',
      memberId: 'mom_123',
      memberName: 'Asha Mehta',
      desiredResolution: 'Member requested a written follow-up before renewing.',
      memberSentiment: 'Member Expressed Dissatisfaction',
      reportedBy: 'Akshay Rane',
      priority: 'High',
      description: 'Member reported that WhatsApp follow-up was delayed after her consultation.',
    };

    expect(getMissingIntakeFields(context)).toEqual([]);
    expect(isIntakePublishable(context)).toBe(true);
  });

  it('captures pasted member voice but ignores route prompts and structured detail submissions', () => {
    expect(captureMemberVoiceFromText('Complaint', {})).toBe(null);
    expect(captureMemberVoiceFromText('Here are the missing details:\nPriority: High', {})).toBe(null);
    expect(
      captureMemberVoiceFromText(
        'Member said the class was overcrowded and asked for a manager call before booking again.',
        {}
      )
    ).toBe('Member said the class was overcrowded and asked for a manager call before booking again.');
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm run test -- src/lib/intake-rules.test.ts
```

Expected: FAIL because `src/lib/intake-rules.ts` does not exist.

- [ ] **Step 3: Implement intake rules**

Create `src/lib/intake-rules.ts`:

```ts
export type IntakePriority = 'Critical' | 'High' | 'Medium' | 'Low';

export interface IntakeContext {
  intakeRoute?: string;
  requestType?: string;
  memberId?: string;
  memberName?: string;
  memberContact?: string;
  sessionId?: string;
  studio?: string;
  trainer?: string;
  classType?: string;
  classDateTime?: string;
  membership?: string;
  category?: string;
  subCategory?: string;
  reportedBy?: string;
  priority?: IntakePriority | string;
  description?: string;
  desiredResolution?: string;
  incidentDateTime?: string;
  memberSentiment?: string;
  freezeStartDate?: string;
  freezeEndDate?: string;
  freezeReason?: string;
  classesRemaining?: string;
  packageExpiryDate?: string;
  requestedRolloverDate?: string;
  rolloverReason?: string;
  partnerName?: string;
  hostedFeedbackArea?: string;
  attendeeCount?: string;
  prospectQuality?: string;
  followUpPreference?: string;
  [key: string]: string | undefined;
}

const INTAKE_ROUTES = ['Request', 'Complaint', 'Feedback', 'Internal Reporting'];
const PLACEHOLDER_VALUE_PATTERN = /unspecified|not specified|member-reported issue|ai intake/i;

const PHYSICAL_STUDIO_CATEGORIES = new Set([
  'Scheduling',
  'Class Experience',
  'Trainer Feedback',
  'Repair and Maintenance',
  'Studio Amenities and Facilities',
  'Safety and Security',
  'Theft and Lost Items',
  'Miscellaneous',
  'Instructor & Class Quality',
  'Booking & Schedule',
  'Facility & Equipment',
  'Front Desk & Service',
]);

const MEMBER_FACING_CATEGORIES = new Set([
  'Scheduling',
  'Class Experience',
  'Trainer Feedback',
  'Pricing and Memberships',
  'Customer Service and Communication',
  'Safety and Security',
  'Theft and Lost Items',
  'Hosted Class & Partnerships',
  'Member Progress & Transformation',
  'Sales & Consultation',
  'Booking & Schedule',
  'Billing & Membership',
  'Front Desk & Service',
]);

const CLASS_CONTEXT_CATEGORIES = new Set([
  'Scheduling',
  'Class Experience',
  'Trainer Feedback',
  'Instructor & Class Quality',
  'Booking & Schedule',
]);

export function isMissingIntakeValue(value: unknown): boolean {
  if (typeof value !== 'string') return true;
  const cleaned = value.trim();
  return !cleaned || PLACEHOLDER_VALUE_PATTERN.test(cleaned);
}

export function captureMemberVoiceFromText(text: string, context: IntakeContext): string | null {
  const value = text.trim();
  if (!value || context.description) return null;
  if (value.length < 12) return null;
  if (INTAKE_ROUTES.includes(value)) return null;
  if (/^(here are the missing details|route this as|please refine the current ticket draft|title:|priority:)/i.test(value)) {
    return null;
  }

  const looksLikeMemberVoice =
    value.length > 35 ||
    /member|client|community|reported|said|stated|requested|complain|feedback|concern|issue|class|studio|refund|freeze|roll|trainer|instructor|billing|payment|booking|temperature|ac/i.test(value);

  return looksLikeMemberVoice ? value : null;
}

export function getMissingIntakeFields(context: IntakeContext): string[] {
  const fields: string[] = [];
  const route = context.intakeRoute || '';
  const routeLower = route.toLowerCase();
  const category = context.category || '';
  const subCategory = context.subCategory || '';
  const text = `${context.requestType || ''} ${category} ${subCategory} ${context.description || ''}`.toLowerCase();

  const add = (field: string, value?: unknown) => {
    if (isMissingIntakeValue(value)) fields.push(field);
  };

  add('intakeRoute', context.intakeRoute);
  if (!route) return Array.from(new Set(fields));

  add('category', context.category);
  add('subCategory', context.subCategory);
  if (!category || !subCategory) return Array.from(new Set(fields));

  const membershipSpecific = /freeze|pause|roll|extension|membership|package|renewal|upgrade|downgrade|auto-renew|refund|expiry|credit|class pack|billing|payment/.test(text);
  const hostedSpecific = /hosted|partner|influencer|partnership/.test(text) || category === 'Hosted Class & Partnerships';
  const prioritySpecific = routeLower !== 'feedback' || /safety|security|theft|repair|maintenance|tech|operating|pricing|membership|customer service|complaint|urgent|injury|hazard/.test(`${category} ${subCategory} ${text}`.toLowerCase());

  if (PHYSICAL_STUDIO_CATEGORIES.has(category)) add('studio', context.studio);
  if (route !== 'Internal Reporting' && (MEMBER_FACING_CATEGORIES.has(category) || membershipSpecific)) {
    add('memberName', context.memberId || context.memberName);
  }

  if (membershipSpecific) {
    add('membership', context.membership);
    if (/freeze|pause/.test(text)) {
      add('freezeStartDate', context.freezeStartDate);
      add('freezeEndDate', context.freezeEndDate);
      add('freezeReason', context.freezeReason);
    }
    if (/roll|extension|expiry|credit/.test(text)) {
      add('classesRemaining', context.classesRemaining);
      add('packageExpiryDate', context.packageExpiryDate);
      add('requestedRolloverDate', context.requestedRolloverDate);
      add('rolloverReason', context.rolloverReason);
    }
  }

  if (CLASS_CONTEXT_CATEGORIES.has(category) || hostedSpecific) add('classType', context.sessionId || context.classType);
  if (category === 'Trainer Feedback') add('trainer', context.trainer);
  if (hostedSpecific) {
    add('partnerName', context.partnerName);
    add('hostedFeedbackArea', context.hostedFeedbackArea);
    add('prospectQuality', context.prospectQuality);
    add('followUpPreference', context.followUpPreference);
  }

  if (route === 'Request' || route === 'Complaint') add('desiredResolution', context.desiredResolution);
  if (route === 'Feedback' || route === 'Complaint') add('memberSentiment', context.memberSentiment);

  add('reportedBy', context.reportedBy);
  if (prioritySpecific) add('priority', context.priority);
  add('description', context.description);

  return Array.from(new Set(fields));
}

export function isIntakePublishable(context: IntakeContext): boolean {
  return getMissingIntakeFields(context).length === 0;
}
```

- [ ] **Step 4: Run tests and verify pass**

Run:

```bash
npm run test -- src/lib/intake-rules.test.ts
```

Expected: PASS.

- [ ] **Step 5: Keep the no-early-draft script**

Update `scripts/check-intake-flow.mjs` to keep the existing source guard and add an import-existence check:

```js
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/ticketing/ChatInterface.tsx', import.meta.url), 'utf8');
const rulesSource = readFileSync(new URL('../src/lib/intake-rules.ts', import.meta.url), 'utf8');

const forbiddenEarlyDraftPattern =
  /data\?\.needsMoreInfo\s*&&\s*contextReadyForDraft\s*\?\s*buildClientDraft/s;

if (forbiddenEarlyDraftPattern.test(source)) {
  throw new Error(
    'Intake regression: the UI can render a fallback ticket draft while the backend still says needsMoreInfo.'
  );
}

if (!source.includes('detailFormForContext')) {
  throw new Error('Intake regression: missing local required-field fallback form for incomplete intake context.');
}

if (!source.includes('captureMemberVoiceFromText')) {
  throw new Error('Intake regression: free-form member voice is not preserved before route/category gates.');
}

if (!rulesSource.includes('getMissingIntakeFields')) {
  throw new Error('Intake regression: missing extracted publishability helper.');
}

console.log('Intake flow regression checks passed.');
```

- [ ] **Step 6: Run regression script**

Run:

```bash
node scripts/check-intake-flow.mjs
```

Expected:

```text
Intake flow regression checks passed.
```

- [ ] **Step 7: Commit if Git is healthy**

Run only if `git status --short` works:

```bash
git add src/lib/intake-rules.ts src/lib/intake-rules.test.ts scripts/check-intake-flow.mjs
git commit -m "test: define intake publishability rules"
```

## Task 2: Wire Rules Into Current Chat Flow

**Files:**
- Modify: `src/components/ticketing/ChatInterface.tsx`
- Modify: `supabase/functions/ticket-ai-chat/index.ts`

- [ ] **Step 1: Replace local member-voice capture with helper**

In `ChatInterface.tsx`, add:

```ts
import {
  captureMemberVoiceFromText,
  getMissingIntakeFields,
  isMissingIntakeValue,
  IntakeContext,
} from '@/lib/intake-rules';
```

Remove the local `PLACEHOLDER_VALUE_PATTERN` and `shouldCaptureAsMemberVoice` definitions.

- [ ] **Step 2: Update the `DetailContext` type**

Replace:

```ts
type DetailContext = Context & Record<string, string | undefined>;
```

With:

```ts
type DetailContext = Context & IntakeContext;
```

- [ ] **Step 3: Use helper in `fieldHasContextValue`**

Update the default return:

```ts
function fieldHasContextValue(field: DetailFormField, ctx: DetailContext): boolean {
  const value = ctx[field.id];
  if (field.id === 'memberName') return Boolean(ctx.memberId || ctx.memberName);
  if (field.id === 'memberContact') return Boolean(ctx.memberContact || ctx.memberId);
  if (field.id === 'classType') return Boolean(ctx.sessionId || ctx.classType);
  if (field.id === 'membership') return Boolean(ctx.membership);
  return !isMissingIntakeValue(value);
}
```

- [ ] **Step 4: Replace `requiredFieldsForIssue` implementation**

Replace the body of `requiredFieldsForIssue` with:

```ts
function requiredFieldsForIssue(ctx: DetailContext, draft?: DraftTicket | null): string[] {
  const mergedContext: DetailContext = draft
    ? {
        ...ctx,
        category: ctx.category || draft.category,
        subCategory: ctx.subCategory || draft.subCategory,
      }
    : ctx;

  return getMissingIntakeFields(mergedContext);
}
```

- [ ] **Step 5: Preserve first pasted member voice using helper**

Replace the `shouldCaptureAsMemberVoice` block in `sendMessage` with:

```ts
const capturedVoice = !contextOverride && !pendingSingleField
  ? captureMemberVoiceFromText(text, activeContext)
  : null;

if (capturedVoice) {
  activeContext = applyDetailValue(activeContext, 'description', capturedVoice);
  setContext(activeContext);
}
```

- [ ] **Step 6: Keep no-draft-while-needs-more-info behavior**

Keep this logic in `sendMessage`:

```ts
const incompleteDraftForm = pruneDetailForm(detailFormForIncompleteDraft(data?.ticket, activeContext), activeContext);
const normalizedForm = pruneDetailForm(normalizeDetailForm(data?.detailForm), activeContext);
const localMissingForm = data?.needsMoreInfo ? pruneDetailForm(detailFormForContext(activeContext), activeContext) : null;
const detailForm = normalizedForm || incompleteDraftForm || localMissingForm;
const ticket = detailForm || data?.needsMoreInfo
  ? null
  : data?.ticket || buildClientDraft(activeContext, text);
```

- [ ] **Step 7: Keep edge-function fallback aligned**

In `supabase/functions/ticket-ai-chat/index.ts`, keep:

```ts
const PLACEHOLDER_VALUE_PATTERN = /unspecified|not specified|member-reported issue|ai intake/i;
```

And make the local `add` helper:

```ts
const add = (field: DetailFieldId, value?: unknown) => {
  const cleaned = cleanString(value);
  if (!cleaned || PLACEHOLDER_VALUE_PATTERN.test(cleaned)) fields.push(field);
};
```

Also require captured description unconditionally:

```ts
add('description', context.description);
```

- [ ] **Step 8: Run focused verification**

Run:

```bash
npm run test -- src/lib/intake-rules.test.ts
node scripts/check-intake-flow.mjs
npm run build
```

Expected: tests pass, regression script passes, build succeeds.

- [ ] **Step 9: Commit if Git is healthy**

Run only if `git status --short` works:

```bash
git add src/components/ticketing/ChatInterface.tsx supabase/functions/ticket-ai-chat/index.ts
git commit -m "fix: block draft review until intake is complete"
```

## Task 3: Add Light Luxury Design Tokens And Lazy Dashboard

**Files:**
- Modify: `src/index.css`
- Modify: `src/components/AppLayout.tsx`

- [ ] **Step 1: Add design tokens**

In `src/index.css`, replace the light `:root` token values with:

```css
:root {
  --background: 0 0% 100%;
  --foreground: 0 0% 9%;
  --card: 0 0% 100%;
  --card-foreground: 0 0% 9%;
  --popover: 0 0% 100%;
  --popover-foreground: 0 0% 9%;
  --primary: 0 0% 9%;
  --primary-foreground: 0 0% 100%;
  --secondary: 42 30% 98%;
  --secondary-foreground: 0 0% 9%;
  --muted: 42 24% 96%;
  --muted-foreground: 32 7% 41%;
  --accent: 42 48% 94%;
  --accent-foreground: 38 42% 32%;
  --destructive: 0 70% 38%;
  --destructive-foreground: 0 0% 100%;
  --border: 39 31% 86%;
  --input: 39 31% 86%;
  --ring: 38 42% 46%;
  --radius: 0.75rem;
}
```

- [ ] **Step 2: Add reusable light luxury classes**

Add below the base layer:

```css
@layer components {
  .p57-app-bg {
    background:
      linear-gradient(180deg, rgba(251, 250, 247, 0.92), rgba(255, 255, 255, 1) 38%),
      #ffffff;
  }

  .p57-panel {
    border: 1px solid #e7e0d2;
    background: #fbfaf7;
    box-shadow: 0 18px 60px rgba(28, 25, 23, 0.06);
  }

  .p57-panel-white {
    border: 1px solid #e7e0d2;
    background: #ffffff;
    box-shadow: 0 16px 48px rgba(28, 25, 23, 0.05);
  }

  .p57-label {
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #a48645;
  }
}
```

- [ ] **Step 3: Lazy-load the dashboard**

In `AppLayout.tsx`, replace the direct dashboard import:

```ts
import { TicketDashboard } from './ticketing/TicketDashboard';
```

With:

```ts
import React, { Suspense, lazy, useState } from 'react';

const TicketDashboard = lazy(() =>
  import('./ticketing/TicketDashboard').then((module) => ({ default: module.TicketDashboard }))
);
```

Remove the previous `import React, { useState } from 'react';` line.

- [ ] **Step 4: Add dashboard fallback**

Wrap the dashboard tab content:

```tsx
<TabsContent forceMount value="tickets" className="m-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
  <Suspense fallback={<div className="flex h-full items-center justify-center bg-white text-sm text-stone-500">Loading submitted tickets...</div>}>
    <TicketDashboard />
  </Suspense>
</TabsContent>
```

- [ ] **Step 5: Update app shell classes**

Change the outer shell to:

```tsx
<div className="p57-app-bg flex h-screen w-screen flex-col overflow-hidden text-stone-950">
```

Change header and tab bars from blue/slate styling to warm borders and white surfaces:

```tsx
<header className="flex-shrink-0 border-b border-[#e7e0d2] bg-white px-6 py-3">
```

And:

```tsx
<div className="flex-shrink-0 border-b border-[#e7e0d2] bg-white px-6 py-2">
```

- [ ] **Step 6: Run build and note chunk change**

Run:

```bash
npm run build
```

Expected: build succeeds. The main JS chunk should decrease because `TicketDashboard` and Recharts move into a lazy chunk.

- [ ] **Step 7: Commit if Git is healthy**

Run only if `git status --short` works:

```bash
git add src/index.css src/components/AppLayout.tsx
git commit -m "perf: lazy load dashboard and add luxury tokens"
```

## Task 4: Build Command Center Panels

**Files:**
- Create: `src/components/ticketing/CommandCenterShell.tsx`
- Create: `src/components/ticketing/IntakeRail.tsx`
- Create: `src/components/ticketing/TicketIntelligencePanel.tsx`
- Modify: `src/components/ticketing/ChatInterface.tsx`

- [ ] **Step 1: Create `TicketIntelligencePanel`**

Create `src/components/ticketing/TicketIntelligencePanel.tsx`:

```tsx
import React from 'react';
import { CheckCircle2, CircleAlert, Clock3, Route, ShieldCheck } from 'lucide-react';
import { ASSIGNMENT_RULES, PRIORITY_SLA, PRIORITY_SLA as SLA } from '@/lib/ticketing-data';
import { getMissingIntakeFields, IntakeContext } from '@/lib/intake-rules';

interface DraftSummary {
  title?: string;
  priority?: 'Critical' | 'High' | 'Medium' | 'Low';
  category?: string;
  subCategory?: string;
}

interface Props {
  context: IntakeContext;
  draft?: DraftSummary | null;
}

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    intakeRoute: 'Intake route',
    category: 'Category',
    subCategory: 'Subcategory',
    memberName: 'Momence member',
    studio: 'Studio space',
    classType: 'Session',
    trainer: 'Instructor',
    membership: 'Active membership',
    desiredResolution: 'Requested resolution',
    memberSentiment: 'Member sentiment',
    reportedBy: 'Documented by',
    priority: 'Priority',
    description: 'Member voice',
  };
  return labels[field] || field.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase());
}

export const TicketIntelligencePanel: React.FC<Props> = ({ context, draft }) => {
  const missing = getMissingIntakeFields(context);
  const publishable = missing.length === 0;
  const category = context.category || draft?.category || 'Awaiting category';
  const assignedTo = ASSIGNMENT_RULES[category] || 'Aditya Verma';
  const priority = (context.priority || draft?.priority || 'Medium') as keyof typeof PRIORITY_SLA;
  const sla = SLA[priority]?.hours || SLA.Medium.hours;

  return (
    <aside className="p57-panel flex min-h-0 flex-col rounded-2xl p-4">
      <div className="mb-4">
        <div className="p57-label">Ticket Intelligence</div>
        <h3 className="mt-2 text-lg font-semibold tracking-tight text-[#171717]">
          {publishable ? 'Ready for review' : `${missing.length} details needed`}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-[#6f6a61]">
          Athena will only show a draft once the required operational context is complete.
        </p>
      </div>

      <div className="space-y-2">
        <Metric icon={<Route className="h-4 w-4" />} label="Route" value={context.intakeRoute || 'Not selected'} />
        <Metric icon={<ShieldCheck className="h-4 w-4" />} label="Owner" value={assignedTo} />
        <Metric icon={<Clock3 className="h-4 w-4" />} label="SLA" value={`${priority} · ${sla}h`} />
      </div>

      <div className="mt-5 rounded-xl border border-[#e7e0d2] bg-white p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-[#171717]">
          {publishable ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <CircleAlert className="h-4 w-4 text-[#a48645]" />}
          Publish readiness
        </div>
        {publishable ? (
          <p className="text-xs leading-relaxed text-[#6f6a61]">All required details are captured. Review the draft before publishing.</p>
        ) : (
          <div className="space-y-1.5">
            {missing.slice(0, 8).map((field) => (
              <div key={field} className="flex items-center justify-between gap-2 rounded-lg bg-[#fbfaf7] px-2.5 py-2 text-xs">
                <span className="text-[#171717]">{fieldLabel(field)}</span>
                <span className="text-[#a48645]">Required</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};

const Metric: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="rounded-xl border border-[#e7e0d2] bg-white p-3">
    <div className="flex items-center gap-2 text-[#a48645]">{icon}<span className="text-[10px] font-bold uppercase tracking-[0.16em]">{label}</span></div>
    <div className="mt-1 truncate text-sm font-semibold text-[#171717]">{value}</div>
  </div>
);
```

- [ ] **Step 2: Create `IntakeRail`**

Create `src/components/ticketing/IntakeRail.tsx`:

```tsx
import React from 'react';
import { Bot, RotateCcw } from 'lucide-react';
import { INTAKE_ROUTES } from '@/lib/ticketing-data';
import { ContextPicker, Context } from './ContextPicker';
import { IntakeContext } from '@/lib/intake-rules';

interface Props {
  context: Context & IntakeContext;
  onChange: (context: Context & IntakeContext) => void;
  onReset: () => void;
}

export const IntakeRail: React.FC<Props> = ({ context, onChange, onReset }) => {
  return (
    <aside className="p57-panel flex min-h-0 flex-col rounded-2xl p-4">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <div className="p57-label">Athena</div>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#171717]">Intake Rail</h2>
        </div>
        <button
          type="button"
          onClick={onReset}
          aria-label="New intake"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#e7e0d2] bg-white text-[#171717] transition hover:border-[#d8c58e]"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-5">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#8d867c]">Route</div>
        <div className="grid gap-2">
          {INTAKE_ROUTES.map((route) => {
            const active = context.intakeRoute === route;
            return (
              <button
                key={route}
                type="button"
                onClick={() => onChange({ ...context, intakeRoute: route })}
                className={`flex h-10 items-center justify-between rounded-xl border px-3 text-left text-xs font-semibold transition ${
                  active
                    ? 'border-[#171717] bg-[#171717] text-white'
                    : 'border-[#e7e0d2] bg-white text-[#171717] hover:border-[#d8c58e]'
                }`}
              >
                {route}
                {active && <Bot className="h-3.5 w-3.5" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#8d867c]">Context</div>
        <ContextPicker context={context} onChange={(next) => onChange({ ...context, ...next })} />
      </div>
    </aside>
  );
};
```

- [ ] **Step 3: Create `CommandCenterShell`**

Create `src/components/ticketing/CommandCenterShell.tsx`:

```tsx
import React from 'react';
import { Context } from './ContextPicker';
import { IntakeContext } from '@/lib/intake-rules';
import { IntakeRail } from './IntakeRail';
import { TicketIntelligencePanel } from './TicketIntelligencePanel';

interface DraftSummary {
  title?: string;
  priority?: 'Critical' | 'High' | 'Medium' | 'Low';
  category?: string;
  subCategory?: string;
}

interface Props {
  context: Context & IntakeContext;
  onContextChange: (context: Context & IntakeContext) => void;
  onReset: () => void;
  draft?: DraftSummary | null;
  children: React.ReactNode;
}

export const CommandCenterShell: React.FC<Props> = ({ context, onContextChange, onReset, draft, children }) => {
  return (
    <div className="p57-app-bg h-full overflow-hidden px-4 py-4 text-[#171717] sm:px-6">
      <div className="mx-auto grid h-full max-w-[1680px] grid-cols-1 gap-4 lg:grid-cols-[270px_minmax(0,1fr)_330px]">
        <IntakeRail context={context} onChange={onContextChange} onReset={onReset} />
        <section className="p57-panel-white flex min-h-[560px] min-w-0 flex-col overflow-hidden rounded-2xl">
          {children}
        </section>
        <TicketIntelligencePanel context={context} draft={draft} />
      </div>
    </div>
  );
};
```

- [ ] **Step 4: Wrap `ChatInterface` with command center shell**

In `ChatInterface.tsx`, import:

```ts
import { CommandCenterShell } from './CommandCenterShell';
```

Find the latest draft before return:

```ts
const latestDraft = [...messages].reverse().find((message) => message.ticket)?.ticket || null;
```

Replace the top-level return wrapper with:

```tsx
return (
  <CommandCenterShell
    context={context}
    onContextChange={(next) => setContext((current) => ({ ...current, ...next }))}
    onReset={resetChat}
    draft={latestDraft}
  >
    <div className="flex h-full min-h-0 flex-col bg-white text-[#171717]">
      {/* existing chat header, message list, and composer go here */}
    </div>
  </CommandCenterShell>
);
```

Remove the old bottom `ContextPicker` section from `ChatInterface.tsx` because the rail now owns context capture.

- [ ] **Step 5: Run build**

Run:

```bash
npm run build
```

Expected: build succeeds. Fix any TypeScript errors from prop types before moving on.

- [ ] **Step 6: Commit if Git is healthy**

Run only if `git status --short` works:

```bash
git add src/components/ticketing/CommandCenterShell.tsx src/components/ticketing/IntakeRail.tsx src/components/ticketing/TicketIntelligencePanel.tsx src/components/ticketing/ChatInterface.tsx
git commit -m "feat: add concierge split command center"
```

## Task 5: Apply Light Luxury Styling To Intake Components

**Files:**
- Modify: `src/components/ticketing/ChatInterface.tsx`
- Modify: `src/components/ticketing/QuickTemplates.tsx`
- Modify: `src/components/ticketing/TicketPreviewCard.tsx`
- Modify: `src/components/ticketing/ContextPicker.tsx`

- [ ] **Step 1: Update chat header**

In `ChatInterface.tsx`, replace the chat header container classes with:

```tsx
<div className="flex-shrink-0 border-b border-[#e7e0d2] bg-white px-4 py-4 sm:px-5">
```

Use the title copy:

```tsx
<h2 className="text-lg font-semibold tracking-tight text-[#171717]">Athena Intake</h2>
<p className="text-xs text-[#6f6a61]">Member voice first · structured capture before draft</p>
```

- [ ] **Step 2: Update message bubbles**

In `MessageBubble`, use:

```tsx
isUser
  ? 'rounded-tr-md bg-[#171717] text-white'
  : 'rounded-tl-md border border-[#e7e0d2] bg-[#fbfaf7] text-[#171717]'
```

- [ ] **Step 3: Update composer**

In `ChatInterface.tsx`, style the composer textarea:

```tsx
className="max-h-32 w-full resize-none rounded-xl border border-[#e7e0d2] bg-white px-4 py-3 pr-3 text-sm text-[#171717] shadow-sm outline-none transition placeholder:text-[#8d867c] focus:border-[#d8c58e] focus:ring-2 focus:ring-[#fffaf0]"
```

Style the send button:

```tsx
className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#171717] text-white shadow-sm transition hover:bg-[#2a2927] disabled:cursor-not-allowed disabled:opacity-40"
```

- [ ] **Step 4: Update `QuickTemplates` route cards**

Use white panels, warm borders, graphite text, and champagne icon boxes:

```tsx
className="group relative overflow-hidden rounded-xl border border-[#e7e0d2] bg-white p-3 text-left shadow-sm transition duration-200 hover:border-[#d8c58e] hover:bg-[#fffaf0]"
```

Icon box:

```tsx
className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg border border-[#e7e0d2] bg-[#fbfaf7] text-[#a48645] transition-colors group-hover:border-[#d8c58e] group-hover:bg-white"
```

- [ ] **Step 5: Update `TicketPreviewCard`**

Replace blue/indigo gradients with a restrained preview:

```tsx
<div className="relative my-3 overflow-hidden rounded-2xl border border-[#e7e0d2] bg-white p-4 shadow-2xl shadow-stone-950/10">
  <div className="absolute inset-x-0 top-0 h-1 bg-[#d8c58e]" />
```

Use primary publish button:

```tsx
className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#171717] py-2 text-xs font-semibold text-white shadow-lg shadow-stone-950/15 transition-all hover:-translate-y-0.5 hover:bg-[#2a2927]"
```

- [ ] **Step 6: Update context picker chips**

In `ContextPicker.tsx`, change selected chips to champagne-on-ivory and unselected chips to white:

```tsx
value
  ? 'bg-[#fffaf0] border-[#d8c58e] text-[#171717]'
  : 'bg-white border-[#e7e0d2] text-[#6f6a61] hover:border-[#d8c58e]'
```

- [ ] **Step 7: Run visual build checks**

Run:

```bash
npm run lint
npm run build
```

Expected: lint has no new errors, build succeeds.

- [ ] **Step 8: Commit if Git is healthy**

Run only if `git status --short` works:

```bash
git add src/components/ticketing/ChatInterface.tsx src/components/ticketing/QuickTemplates.tsx src/components/ticketing/TicketPreviewCard.tsx src/components/ticketing/ContextPicker.tsx
git commit -m "style: apply light luxury intake styling"
```

## Task 6: Rendered Browser QA

**Files:**
- No source files unless QA finds issues.

- [ ] **Step 1: Start dev server**

Run:

```bash
npm run dev -- --host 127.0.0.1
```

Expected: Vite prints a localhost URL.

- [ ] **Step 2: Use Browser plugin for first viewport**

Open the Vite URL in the in-app browser.

Checks:

- Page title and URL are correct.
- App is not blank.
- No Vite or React error overlay.
- Console has no relevant runtime errors.
- Screenshot shows white/light luxury command center, not old blue support UI.

- [ ] **Step 3: Exercise incomplete intake**

Interaction path:

1. Start new intake.
2. Paste: `Member said the class was overcrowded and asked for a manager call before booking again.`
3. Select route `Complaint`.
4. Select category `Class Experience`.
5. Select a subcategory such as `Overcrowding in Class`.

Expected:

- Member voice remains captured.
- Required-field form appears.
- Ticket preview does not appear yet.
- Right panel lists missing fields.

- [ ] **Step 4: Exercise publishable state**

Complete required fields in the rendered UI:

- Studio space.
- Momence member or allowed manual member fallback if Momence is unavailable.
- Session/class context.
- Requested resolution.
- Member sentiment.
- Documented by.
- Priority.

Expected:

- Right panel changes to ready for review.
- Draft preview appears.
- Publish button is visible only after publishable state.

- [ ] **Step 5: Check responsive layout**

Use Browser or Playwright viewport controls to inspect:

- Desktop around `1440x900`.
- Mobile around `390x844`.

Expected:

- Desktop has three clear panels.
- Mobile stacks panels without horizontal overflow.
- Text does not overlap controls.
- Primary actions remain visible and readable.

- [ ] **Step 6: Run final commands**

Run:

```bash
npm run test
node scripts/check-intake-flow.mjs
npm run lint
npm run build
```

Expected: tests pass, regression script passes, lint has no new errors, build succeeds.

- [ ] **Step 7: Commit if Git is healthy**

Run only if source changes were needed and `git status --short` works:

```bash
git add .
git commit -m "fix: polish command center qa issues"
```

## Self-Review Notes

- Spec coverage: intake stabilization is covered in Tasks 1 and 2; light luxury styling is covered in Tasks 3 and 5; Concierge Split layout is covered in Task 4; faster capture and no early drafts are covered in Tasks 1, 2, and 6; performance is covered by lazy dashboard loading in Task 3; rendered QA is covered in Task 6.
- Placeholder scan: no task uses TBD, TODO, or unspecified implementation details.
- Type consistency: `IntakeContext`, `getMissingIntakeFields`, `isMissingIntakeValue`, and `captureMemberVoiceFromText` are introduced in Task 1 and reused consistently in later tasks.
- Known blocker: commits must be skipped if the repository still reports `fatal: bad object HEAD`.
