---
description: "Restate requirements, assess risks, and create step-by-step implementation plan. WAIT for user CONFIRM before touching any code."
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
  - WebSearch
  - WebFetch
argument-hint: "<feature description>"
---

# Plan Command

This command creates a comprehensive implementation plan before writing any code.

## What This Command Does

1. **Restate Requirements** - Clarify what needs to be built
2. **Identify Risks** - Surface potential issues and blockers
3. **Create Step Plan** - Break down implementation into phases
4. **Wait for Confirmation** - MUST receive user approval before proceeding

## When to Use

Use `/plan-feature` when:

- Starting a new feature
- Making significant architectural changes
- Working on complex refactoring
- Multiple files/components will be affected
- Requirements are unclear or ambiguous

## How It Works

The planner will:

1. **Analyze the request** and restate requirements in clear terms
2. **Break down into phases** with specific, actionable steps
3. **Identify dependencies** between components
4. **Assess risks** and potential blockers
5. **Estimate complexity** (High/Medium/Low)
6. **Present the plan** and WAIT for your explicit confirmation

## Example Usage

```
User: /plan-feature Add book reservation notifications so patrons get notified when a reserved book is available for pickup

Agent:
# Implementation Plan: Book Reservation Notifications

## Requirements Restatement
- Notify patrons when a reserved book becomes available at their branch
- Support in-app notifications and email
- Show pickup deadline and branch location
- Track notification status (sent, read, expired)

## Implementation Phases

### Phase 1: Data Model
- Define Notification type in lib/types.ts: id, patron_id, reservation_id, branch, status, created_at, expires_at
- Define NotificationPreferences type for patron channel settings
- Add Zod schemas for validation

### Phase 2: Server Actions
- Create lib/actions/notifications.ts with Server Actions:
  - sendReservationNotification(patronId, reservationId)
  - markNotificationRead(notificationId)
  - getPatronNotifications(patronId)
- Integrate with Bibliofil SIP2 for reservation status updates

### Phase 3: Frontend Components
- Create NotificationBell Server Component in header (fetches unread count)
- Add NotificationList client component with real-time dropdown
- Create notification preferences section on "Min side" (My Page)
- Ensure all components meet WCAG 2.1 AA (focus management, aria-live regions)

### Phase 4: Background Processing
- Implement polling or webhook listener for Bibliofil reservation status changes
- Queue and batch notifications to avoid duplicates
- Handle pickup deadline expiry (auto-dismiss expired notifications)

## Dependencies
- Bibliofil SIP2 integration (reservation status)
- Email service for patron email notifications
- Next.js Server Actions for mutations

## Risks
- HIGH: Bibliofil SIP2 latency and reliability for real-time status
- MEDIUM: Handling 356 libraries with different branch configurations
- MEDIUM: Email deliverability across municipal email domains
- LOW: Notification volume during peak reservation periods

## Estimated Complexity: MEDIUM
- Server Actions + data model: 4-5 hours
- Frontend components: 3-4 hours
- Bibliofil integration: 3-4 hours
- Testing (Vitest + Playwright): 2-3 hours
- Total: 12-16 hours

**WAITING FOR CONFIRMATION**: Proceed with this plan? (yes/no/modify)
```

## Important Notes

<important>The planner agent will not write any code until you explicitly confirm the plan with "yes", "proceed", or similar affirmative response.</important>

If you want changes, respond with:

- "modify: [your changes]"
- "different approach: [alternative]"
- "skip phase 2 and do phase 3 first"

## Integration with Other Workflows

After planning:

- The TDD workflow is available as a skill for test-driven development
