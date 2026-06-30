# Organizer Ops Panel System Map

## Purpose

This document maps the real current system state across frontend and backend to support a correct implementation of the organizer operations panel.

It focuses on:

- where organizer operations currently live
- what backend capabilities already exist
- what frontend surfaces already consume them
- which mismatches must be fixed before a robust ops panel can ship

## 1. Frontend Route Map

### Organizer Namespace

Current organizer namespace:

- `src/app/organizer/layout.tsx`
- `src/app/organizer/tournaments/page.tsx`
- `src/app/organizer/tournaments/[id]/manage/page.tsx`
- `src/app/organizer/payouts/page.tsx`
- `src/app/organizer/series/...`

Important observation:

- organizer pages already sit behind a dedicated layout and route guard
- this confirms the operations panel should be added as a sibling route under organizer tournaments

Recommended placement:

- `src/app/organizer/tournaments/[id]/ops/page.tsx`

### Public Live Namespace

Current live route:

- `src/app/(public)/live/[matchId]/page.tsx`

Important observation:

- this page contains organizer/referee live control logic even though it is in the public route tree
- this is acceptable for viewing, but not ideal as the primary organizer command center

Conclusion:

- keep public live page for scoreboard and local control
- do not use it as the organizer operations home
- ops panel should deep-link into this page where needed

## 2. Current Frontend Surfaces by Business Capability

### A. Tournament Configuration

Current home:

- `manage/page.tsx`

Already supports:

- tournament metadata
- division setup
- schedule setup
- bracket generation
- registration list
- finance config
- permissions

Constraint:

- this screen is configuration-heavy and already large
- it should not become the day-of-play control center

### B. Participant Management

Current home:

- `manage/components/RegistrationTab.tsx`

Already supports:

- roster list
- approve pending registration
- reject-like action through `WITHDRAWN`
- wildcard assignment
- mock participant generation

Missing:

- kick action in organizer UI
- pair detail drawer
- check-in
- no-show
- replacement
- incident history

### C. Match Management

Current homes:

- `manage/components/ScheduleTab.tsx`
- `manage/components/BracketTab.tsx`
- `public/live/[matchId]/page.tsx`

Already supports:

- schedule assignment
- bracket view
- live score controls
- start match
- complete match

Missing:

- one organizer-centric match queue
- one-click walkover
- injury retirement action
- disqualification action
- void match action

### D. Finance Consequences

Current homes:

- `manage/components/FinanceTab.tsx`
- withdrawal and kick logic in backend

Already supports:

- refund pending on withdrawal
- refund pending on kick

Missing:

- organizer-facing consequence preview before taking action
- incident-linked refund policy

## 3. Backend Endpoint Inventory Relevant to Ops

### Tournament Endpoints Already Useful

From `tournaments.controller.ts`:

- `GET /tournaments/:id`
- `GET /tournaments/:id/participants`
- `GET /tournaments/:id/divisions/:divisionId/participants`
- `PATCH /tournaments/:id/participants/:participantId`
- `POST /tournaments/:id/participants/:participantId/kick`
- `POST /tournaments/:id/reserve-slots`
- `POST /tournaments/:id/lock`
- `POST /tournaments/:id/stages/:stageId/finalize`
- `POST /tournaments/:id/playoff`

Interpretation:

- participant and bracket-stage operations mostly belong in `tournaments`

### Match Endpoints Already Useful

From `matches.controller.ts`:

- `GET /matches`
- `GET /matches/:id`
- `PATCH /matches/:id/score`
- `PATCH /matches/:id/status`
- `PATCH /matches/:id/schedule`
- `PATCH /matches/:id/assign-referee`

Interpretation:

- active match execution belongs in `matches`

## 4. Current Backend Business Rules

### Withdrawal

Current rule:

- self-withdraw is only allowed while tournament registration is still open
- after registration lock or after start, self-withdraw is blocked

Impact:

- organizer panel needs a separate forced action for late issues
- self-service and organizer-service must remain distinct

### Participant Status Update

Current service rule:

- organizer/admin may update participant status only when tournament status is `REGISTRATION_OPEN`

Impact:

- current status patch endpoint is pre-lock only
- any post-lock operational decision needs either:
  - new endpoint
  - or expanded business rules

### Kick Participant

Current service behavior:

- organizer/admin/community owner or moderator can kick
- status becomes `KICKED`
- paid entry triggers `PENDING_REFUND`
- active scheduled or ongoing matches are auto-completed in favor of opponent
- next match progression is updated

This is already powerful enough for MVP ops usage.

Gap:

- frontend does not expose it clearly in organizer management

### Match Status and Score

Current service behavior:

- organizer/referee/admin can start match via `ONGOING`
- organizer/referee/admin can update score
- completion validates winner
- ranking and notifications run after completion

Gap:

- technical results such as walkover or injury retirement are not modeled as first-class actions

## 5. Critical Frontend/Backend Mismatches

### Mismatch 1: Frontend Participant Type Is Too Narrow

Current frontend type:

- `teamStatus?: 'PENDING' | 'COMPLETE' | 'WITHDRAWN'`

But backend behavior already uses or implies:

- `KICKED`
- `REJECTED`

Impact:

- organizer panel cannot accurately render all states
- current UI risks silent state mismatch

Required fix:

- expand frontend participant type before building full ops panel

### Mismatch 2: Participant List Filtering Excludes `WITHDRAWN` but Not `KICKED`

Current repository participant query filters out:

- `WITHDRAWN`

But does not filter out:

- `KICKED`

Impact:

- kicked teams may still appear in participant lists unless the ops panel intentionally distinguishes them

Decision needed:

- either active list excludes `KICKED`
- or ops panel supports separate views:
  - active
  - withdrawn
  - kicked

### Mismatch 3: Public Live Page Contains Organizer Controls

Current situation:

- live page is in public route tree
- control actions are conditionally available to authorized users

Impact:

- acceptable technically
- weak operational boundary conceptually

Decision:

- keep current implementation for match execution
- use ops panel as organizer entry point and open live page from it

### Mismatch 4: Participant Status Patch Is Pre-Lock Only

Current rule in service:

- `updateParticipantStatus` only allowed during `REGISTRATION_OPEN`

Impact:

- post-lock organizer decisions cannot rely on this endpoint
- operations panel must not assume this endpoint works for all tournament phases

## 6. Recommended Ownership Matrix

### Tournaments Module

Owns:

- participant status before lock
- wildcard assignment
- kick participant
- replacement workflow
- participant incidents not tied to active score entry
- division and bracket finalization decisions

### Matches Module

Owns:

- start match
- score entry
- finish match
- court assignment
- referee assignment
- walkover
- injury retirement
- disqualification at match level

### Rankings Module

Owns:

- ELO and pair-rank consequences after result finalization

## 7. Recommended Frontend Build Order

### Step 1

Create route:

- `src/app/organizer/tournaments/[id]/ops/page.tsx`

Use it to aggregate:

- tournament detail
- participants
- matches list

### Step 2

Add participants workspace first.

Reason:

- this is where most organizer-specific pair decisions live
- it also exposes missing state semantics fastest

### Step 3

Add match queue workspace.

Reason:

- start/continue matches is the second most time-sensitive organizer task

### Step 4

Add incidents domain and UI.

Reason:

- after the basic actions exist, they need auditable reasons and history

## 8. Placement Decision Reconfirmed

### Frontend

Place the panel at:

- `src/app/organizer/tournaments/[id]/ops/page.tsx`

### Frontend Feature Logic

Place organizer ops business logic at:

- `src/features/organizer/ops/`

### Backend

Do not create a standalone ops module in MVP.

Instead:

- extend `tournaments`
- extend `matches`
- reuse `rankings`

## 9. Immediate Pre-Implementation Fixes

Before building the full panel, fix these foundations:

1. Expand `TournamentParticipant.teamStatus` frontend typing.
2. Decide how `KICKED` should appear in participant queries and UI lists.
3. Add API client methods for kick and later incident actions.
4. Define whether public live remains the execution surface or whether a protected organizer live page will be added later.
