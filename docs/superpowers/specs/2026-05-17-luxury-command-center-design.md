# Physique 57 Light Luxury Command Center Design

Date: 2026-05-17
Status: Approved with light luxury palette

## Goal

Redesign the Physique 57 India internal ticketing app into a fast, premium, minimal operations command center that captures member voice accurately before any ticket draft appears.

The app must feel ultra luxurious, modern, minimal, and professional, while improving the speed and reliability of ticket generation for studio associates, instructors, sales, client success, and management.

## Current Codebase Findings

The app is a Vite React application using shadcn/Radix primitives, Supabase, and an edge function named `ticket-ai-chat`.

Key strengths:

- The app already supports route, category, subcategory, context chips, Momence member/session search, AI ticket drafting, ticket publishing, SLA tracking, and dashboard views.
- The data model already persists dynamic intake context in ticket metadata.
- The dashboard has useful operational views, including list, table, kanban, grouped, SLA, and analytics.

Key issues to improve:

- The chatflow logic is split across `ChatInterface.tsx` and `ticket-ai-chat/index.ts`, which makes required-field behavior harder to reason about.
- The old UI can feel like a generic blue support tool rather than a premium internal Physique 57 workspace.
- The current chat-first layout buries context and routing in a bottom strip, slowing capture during busy studio moments.
- The initial bundle is large because the intake surface and dashboard/chart-heavy views load together.
- The ticket draft experience needs a stronger publishability contract: no draft preview until required information is complete.

## Approved Product Direction

Use the Concierge Split Command Center structure with a light luxury palette.

Desktop layout:

- Left panel: intake rail and captured context.
- Center panel: Athena intake workspace, member voice capture, structured required-field forms, and eventual draft review.
- Right panel: ticket intelligence, SLA, owner, priority, confidence, follow-up, and publish readiness.

Mobile and narrow tablet layout:

- Stack the same panels in a task-first order.
- First show member voice and required fields.
- Collapse ticket intelligence into a sticky summary or drawer.
- Keep primary publish action visible only when the ticket is publishable.

## Visual System

Palette:

- App background: `#FFFFFF`
- Soft surface: `#FBFAF7`
- Elevated surface: `#FFFFFF`
- Primary text: `#171717`
- Secondary text: `#6F6A61`
- Muted text: `#8D867C`
- Warm border: `#E7E0D2`
- Strong border: `#D8C58E`
- Champagne accent: `#A48645`
- Soft gold surface: `#FFFAF0`
- Primary action: `#171717`
- Success: restrained emerald
- Warning: amber
- Critical: deep red or aubergine, used sparingly

Style rules:

- No dark app background.
- Use true white as the main canvas.
- Use ivory only for contained panels and subtle section distinction.
- Use champagne as an accent, not as a dominant fill.
- Keep border radius mostly 8 to 14 px. Avoid oversized rounded cards.
- Avoid nested cards. Panels may contain grouped form rows, but not card-inside-card layouts.
- Use lucide icons for functional actions only.
- Keep typography compact and operational, not marketing-like.
- Do not use gradient or decorative orb backgrounds.

## Chatflow Architecture

The target intake flow:

1. Capture member voice once.
2. Classify route, category, and subcategory.
3. Run one publishability schema to identify missing required fields.
4. Show a structured intake card with only missing fields.
5. Use Momence search for member, session, and active membership context.
6. Show live draft intelligence only after minimum required data is present.
7. Show the full draft preview only when publishable.
8. Publish only after explicit team-member approval.

Publishability contract:

- A ticket draft must not render while `needsMoreInfo` is true.
- Placeholder values such as "Unspecified Studio", "Member-reported issue", "Not specified", and "AI Intake" do not count as complete data.
- Required fields must be derived from one shared schema that can be reused by frontend and backend logic.
- `reportedBy`, `description`, route, category, and subcategory are always required.
- Member-facing tickets require Momence member context when possible.
- Session or class-related tickets require Momence session context when possible.
- Membership, freeze, rollover, refund, billing, and package tickets require active membership context.
- Safety, theft, medical, and urgent service failures require explicit priority and SLA review.

## Proposed Component Structure

Create or refactor toward these units:

- `CommandCenterShell`: top-level responsive layout and tab/app navigation.
- `IntakeRail`: route, category, subcategory, member, session, studio, instructor, membership, and documented-by context.
- `AthenaWorkspace`: member voice input, chat transcript, required-field capture, loading, and error states.
- `RequiredFieldsCard`: schema-driven form renderer with grouped fields and Momence-aware fields.
- `TicketIntelligencePanel`: publishability status, SLA, routing owner, confidence, sentiment, follow-up preference, and missing-field summary.
- `DraftReviewPanel`: publishable ticket preview and final publish controls.
- `useIntakeState`: reducer or state helper for context, messages, schema results, and draft status.
- `intakeSchema`: shared required-field map and publishability helper.

Avoid one large `ChatInterface.tsx` owning all UI, data rules, and rendering.

## Data And API Changes

Near-term:

- Keep the current Supabase schema.
- Continue storing dynamic fields under ticket metadata.
- Add frontend helper tests around the publishability schema.
- Keep the edge function response shape compatible with the current UI.

Medium-term:

- Move route/category/subcategory field requirements into a shared JSON-compatible schema.
- Use the schema in both the frontend and `ticket-ai-chat`.
- Add a `publishable` boolean and `missingFields` array to AI/fallback responses.
- Consider persisting intake confidence, route confidence, and follow-up preference in metadata.

## Faster Information Capture

Improvements:

- Keep member voice input available at all times.
- Allow "paste everything" capture first, then structured extraction.
- Use command chips for Route, Complaint, Feedback, Internal Reporting.
- Auto-save captured voice and context locally during the active session.
- Use search-first controls for long lists like member, session, instructor, category, and subcategory.
- Show missing fields as a short checklist in the right panel.
- Prefer one grouped structured form over multiple assistant questions.
- Make `Enter` submit only in single-line command states; keep textarea behavior predictable.

## Performance Improvements

- Lazy-load `TicketDashboard` when the Submitted Tickets tab is first opened.
- Lazy-load chart-heavy analytics dependencies and dashboard views.
- Keep the chat intake route as the first-load critical path.
- Memoize derived dashboard stats and filtering where possible.
- Split large `ChatInterface.tsx` into smaller components so hot reload and debugging are faster.

## Error Handling

- If AI fails, fallback to the local schema and ask for missing fields instead of drafting prematurely.
- If Momence search fails, show a scoped error near the field and allow a controlled manual fallback only when needed.
- If ticket creation fails, preserve the draft and all context.
- If required data is incomplete, disable publish and show exactly what is missing.

## Testing And Verification

Required checks:

- Regression check: no fallback ticket draft while `needsMoreInfo` is true.
- Unit tests or lightweight checks for publishability rules.
- Build and lint.
- Browser test for: app loads, new intake starts, member voice is captured, required fields render, draft is blocked until required fields are complete, publish button appears only when publishable.
- Visual QA on desktop and mobile.
- Console health check during rendered app testing.

## Implementation Phases

1. Stabilize intake rules.
   - Extract publishability helpers.
   - Add tests for required-field behavior.
   - Keep current visuals mostly intact.

2. Build the light command-center shell.
   - Introduce `CommandCenterShell`, `IntakeRail`, `AthenaWorkspace`, and `TicketIntelligencePanel`.
   - Apply the approved light luxury design tokens.

3. Improve structured capture.
   - Replace bottom context strip with left intake rail.
   - Group required fields.
   - Add live missing-field and publishability status.

4. Refine ticket review and dashboard performance.
   - Redesign `TicketPreviewCard` and dashboard header.
   - Lazy-load dashboard and chart-heavy code.

5. Browser QA and polish.
   - Test desktop, tablet, and mobile.
   - Fix spacing, clipping, overflow, contrast, and interaction issues.

## Acceptance Criteria

- The app uses a white, light luxury visual system and no dark global background.
- A ticket draft never appears before required information is captured.
- Member voice is captured once and reused.
- Required fields are shown in one structured capture surface.
- Momence-backed context remains available and prominent.
- The right panel clearly shows missing fields, routing, SLA, priority, owner, and publish readiness.
- The first screen feels like an internal premium operations command center, not a generic chat widget.
- Build passes.
- Lint has no new errors.
- Rendered browser QA verifies the core intake flow.
