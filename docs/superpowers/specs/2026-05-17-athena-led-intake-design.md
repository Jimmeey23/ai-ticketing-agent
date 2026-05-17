# Athena-Led Ticket Intake Design

Date: 2026-05-17
Status: Approved direction, pending written spec review

## Goal

Shift the app from a static route/category workflow to an Athena-led intake workflow.

Internal team members should be able to write down the details of a member feedback, issue, request, or complaint in natural language. Athena then extracts the operational intelligence, asks only for missing details, prepares a ticket draft, and publishes the ticket only after explicit approval.

## Product Behavior

The first interaction is free-text documentation, not route selection.

Target flow:

1. Team member writes what the community member reported.
2. Athena captures the member voice as `description`.
3. Athena infers `intakeRoute`, `category`, `subCategory`, `priority`, and urgency rationale from the provided details.
4. Athena auto-sets `reportedBy` from the signed-in Supabase user.
5. Athena asks only for missing operational details that are required to make the ticket publishable.
6. Athena shows the ticket draft only after required details are complete.
7. Team member can refine or approve the draft.
8. Approved draft is published as a submitted ticket.

Route/category/subcategory remain editable after Athena infers them. The app should treat them as Athena's classification, not as a mandatory starting wizard.

## Classification And Urgency

Athena must infer classification from the member voice and current context:

- `intakeRoute`: Request, Complaint, Feedback, or Internal Reporting.
- `category`: one of the approved Physique 57 category constants.
- `subCategory`: one of the approved subcategories for the selected category.
- `priority`: Critical, High, Medium, or Low.
- `urgencyReason`: short explanation for why that priority was chosen.

Priority guidance:

- Critical: safety, medical, security, harassment, theft in progress, major operational risk.
- High: urgent service failure, unresolved escalation, strong retention risk, refund/billing urgency, angry or frustrated member requiring management response.
- Medium: normal complaint, request, or concern needing follow-up.
- Low: compliment, low-urgency suggestion, general preference, non-blocking feedback.

The frontend should show inferred classification and urgency as editable context. If the user changes category or subcategory, missing-field requirements should recalculate.

## Reported By

`reportedBy` is system-owned.

Source order:

1. `user.user_metadata.full_name`
2. `user.user_metadata.name`
3. `user.email`
4. `Authenticated user`

The user should not be asked to fill `reportedBy` in the intake form. The context picker should not include a manual "Reported by" selector unless a future admin override feature is explicitly designed.

The value must still be sent in ticket context and included in the final draft and created ticket row.

## Missing Details Contract

A ticket draft must not render until the intake is publishable.

Always required:

- `description`
- `intakeRoute`
- `category`
- `subCategory`
- `priority`
- `reportedBy`, supplied automatically by auth

Conditionally required:

- Member-facing issues require selected Momence member context when possible.
- Class/session issues require selected Momence session context when possible.
- Studio-space issues require studio context.
- Instructor-specific feedback requires instructor context.
- Membership, freeze, rollover, refund, billing, renewal, expiry, or package issues require membership context.
- Freeze requests require start date, end date, and member-stated reason.
- Rollover/extension requests require remaining classes, package expiry, requested extension date, and reason.
- Complaints and requests require desired resolution when the member stated one or the team needs a follow-up action.
- Feedback and complaints require member sentiment when inferable or confirmable.

Placeholder values such as `Unspecified Studio`, `Member-reported issue`, `Not specified`, and `AI Intake` do not count as complete.

## UI Changes

The intake workspace should lead with a large member voice textarea:

- Placeholder: "Document what the member/client reported..."
- Supporting copy should be minimal and operational.
- Quick templates should not drive the user into static route cards. If retained, they should insert example prompts or common intake starters, not preselect a flow.

When Athena infers classification, show a compact editable summary:

- Route
- Category
- Subcategory
- Priority
- Urgency reason
- Documented by

When details are missing, show one grouped structured form. It should include only the missing fields. Momence member, session, and membership fields should use the existing search behavior.

The draft preview appears only once all required fields are complete.

## Frontend Architecture

Update `ChatInterface.tsx` behavior before broader visual refactoring:

- Remove the hard `fastGateForm` behavior that blocks AI until route/category/subcategory are manually selected.
- Seed context with authenticated `reportedBy`.
- Let the first free-text message call the AI with member voice and existing context.
- Normalize AI-inferred route/category/subcategory/priority back into local context.
- Recalculate missing fields using the shared intake rules after each AI response or form submit.
- Suppress any draft when missing fields remain.
- Keep publish guarded by the same missing-field check.

Update `ContextPicker.tsx`:

- Remove manual `reportedBy` picker.
- Keep classification and operational context editable.

Update `intake-rules.ts`:

- Stop treating `reportedBy` as user-entered missing detail when auth has supplied it.
- Add support for `urgencyReason`.
- Keep placeholder detection.
- Keep publishability as the single source of truth for draft visibility and publish eligibility.

## Edge Function Behavior

Update `supabase/functions/ticket-ai-chat/index.ts` prompt and fallback behavior:

- Do not instruct Athena to require category/subcategory selection before issue-specific fields.
- Instruct Athena to infer route/category/subcategory/priority from member voice.
- Return inferred context fields even when more details are needed.
- Never return a ticket while required fields are missing.
- In fallback mode, infer a best-effort category/subcategory/priority from text before returning missing-field form.

Keep the response shape compatible with the current frontend, but allow adding:

- `inferredContext`
- `missingFields`
- `publishable`
- `urgencyReason`

The frontend should tolerate these fields being absent while the edge function is being deployed.

## Testing

Add or update tests for:

- Free-text member voice no longer triggers a route-first gate.
- Athena-inferred category/subcategory/priority are accepted into context.
- `reportedBy` is auto-populated from the signed-in user and not requested in missing fields.
- Draft is blocked while required fields remain missing.
- Draft appears when inferred classification plus required details are complete.
- Publish is blocked if placeholders remain.

Existing no-early-draft regression checks should stay in place.

## Acceptance Criteria

- Team member can begin by typing the feedback/issue/complaint details directly.
- Athena infers route, category, subcategory, urgency, and priority from the provided details.
- The app asks only for missing details before drafting.
- `reportedBy` is automatically set from the signed-in user.
- Manual route/category/subcategory selection is optional correction, not the starting flow.
- Ticket draft does not appear until publishability rules pass.
- Publish still requires explicit approval.
- Build and relevant tests pass.

## Known Blocker

Git is currently unhealthy in this workspace: `git status --short` returns `fatal: bad object HEAD`. The spec cannot be committed until repository HEAD is repaired.
