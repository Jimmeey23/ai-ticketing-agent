# Owner Status, Resolution, Notifications, and Routing Design

## Goal

Tighten Athena ticket ownership controls and make operational closure more auditable: admins may update any ticket status, while support users may update status only when they are the assigned owner. Status updates must capture resolution context, notifications need a clear-all read action, and settings routing should be managed by category rather than subcategory.

## Status Permission

The app will use a shared permission helper that compares the signed-in identity set against the ticket owner name and employee email. Admins always pass. Support users pass only when the ticket's `assignedTo` value or matching employee email belongs to them. The ticket drawer will disable status/resolution controls for non-owners, and the ticket context will reject unauthorized status patches before attempting a Supabase update.

## Resolution Detail Capture

Status changes will use a structured resolution form instead of a bare dropdown. The form captures the new status, reason, action taken, action date, follow-up date, comments, and notes. Resolved and Closed statuses require reason and action taken. The latest detail and a history list will be stored in ticket metadata, and the same detail will be written into the `ticket_events.metadata` payload for auditability.

## Notifications

Notifications remain generated from owner-specific SLA signals, but the context will keep a local read set keyed by notification id. The Notifications tab will expose `Clear all notifications`, which marks all current notifications as read and removes them from the active list and badge.

## Category-Level Routing

Routing settings will prefer rules where `subCategory` is blank, making category the primary owner/associate/routing unit. Legacy subcategory-specific rules can still resolve, but default settings and the Settings tab will present category-level rules. The resolver will still accept subcategory input for compatibility and pick active category rules when no active subcategory-specific rule exists.

## Bulk Routing Controls

The Settings routing tab will add advanced filters for category, department, owner, location, active state, and priority. Bulk actions apply only to the filtered routing rules: activate/pause, set owner pool, set department, set escalation, set priority, and set SLA hours.

## Verification

Tests will cover owner/admin status permissions and category-level routing resolution. Build and rendered UI validation will verify the status/resolution panel, notification clear-all behavior, and settings controls.
