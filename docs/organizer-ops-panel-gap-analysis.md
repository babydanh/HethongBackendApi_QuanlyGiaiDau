# Organizer Ops Panel Gap Analysis

## Scope

This document compares current codebase capabilities against the target `Organizer Ops Panel`.

Relevant current modules:

- `src/modules/tournaments`
- `src/modules/matches`
- `src/modules/rankings`
- `frontend organizer manage page`
- `frontend live match page`

## Final Placement Decision

### Frontend

Recommended route:

- `/organizer/tournaments/[id]/ops`

Recommended source location:

- `src/app/organizer/tournaments/[id]/ops/page.tsx`

Why this is the correct placement:

- same ownership boundary as current organizer work
- same route family as `/organizer/tournaments/[id]/manage`
- reuses organizer sidebar and route guard from `src/app/organizer/layout.tsx`
- avoids mixing organizer-only actions into public live pages

### Backend

Recommended ownership:

- `tournaments` module owns participant, registration, wildcard, kick, replacement, incident decisions tied to tournament enrollment
- `matches` module owns start, schedule, score, walkover, injury retirement, void, and match-status decisions
- `rankings` module owns side effects on ELO and pair ranks

Why no standalone `ops` module in MVP:

- current architecture is domain-first, not use-case-first
- organizer operations are orchestration over existing domains, not a separate domain of truth
- a dedicated `ops` module would likely become a thin proxy layer and add complexity too early

## What Already Exists

### Organizer Manage Surface

Frontend already has:

- tournament configuration shell in `manage/page.tsx`
- registration tab
- bracket tab
- finance tab
- schedule tab

Current strengths:

- division-aware participant loading
- wildcard assignment
- mock participant generation
- approve and reject-like actions for registrations
- lock registration and generate bracket

### Match Operations

Backend already has:

- update match status endpoint
- update match score endpoint
- update match schedule endpoint
- assign referee endpoint

Frontend already has:

- live match control page
- start match
- increment/decrement points
- finish set
- manually complete match

### Pair Registration Model

Current model already supports:

- team-based participants
- roster members on a participant
- pending doubles team completion
- mixed doubles validation in registration

### Existing Removal Flows

Current backend already supports:

- participant withdrawal
- participant kick endpoint
- participant status patch

## What Is Missing

### 1. Centralized Organizer Operations Route

Missing:

- dedicated `/ops` panel route
- consolidated day-of-tournament operations view
- central queue for participants, matches, and incidents

Impact:

- organizers must switch between `manage` and `public/live`

### 2. Incident Domain Model

Missing:

- explicit incident entity
- incident type taxonomy
- decision history
- evidence attachment field
- audit-friendly resolution flow

Current workaround:

- status changes exist, but there is no structured incident record

### 3. Participant Status Semantics

Current state is not explicit enough.

Observed values in practice:

- `PENDING`
- `COMPLETE`
- `WITHDRAWN`
- `KICKED`

Missing or blurred:

- `REJECTED`
- `NO_SHOW`
- `DISQUALIFIED`
- `REPLACED`

Business risk:

- refunds, notifications, and reporting cannot clearly distinguish voluntary withdrawal vs forced removal vs disciplinary action

### 4. Pair Replacement Workflow

Missing:

- replace-one-member flow for doubles or mixed doubles
- revalidation flow after replacement
- bracket impact review for replacement after lock

Business risk:

- no safe system path for injury substitution or roster correction

### 5. Match Technical Decisions

Missing or not explicit in UX:

- walkover action
- injury retirement action
- void match action
- disqualification action

Note:

- some of these can be emulated through score/status updates today, but there is no clear organizer UX or business trace

### 6. Pair Ranking Consistency

Current ranking service updates pair ranking for:

- `DOUBLES`

Gap:

- `MIXED_DOUBLES` does not appear to use the same pair-ranking branch

Business risk:

- mixed doubles operational decisions can finish correctly in bracket terms but still miss pair ranking consequences

### 7. Finance Consequence Engine

Missing:

- refund rule mapping by operational reason
- organizer-side impact preview before kick/disqualify/withdraw
- payout hold rules linked to unresolved incidents

### 8. Check-in and Attendance

Missing:

- check-in state
- no-show state
- court arrival verification

Operational importance:

- needed for day-of-play management

## Frontend Gap Summary

Need to build:

- `ops` route
- overview widgets
- participants table with drawer
- matches queue board
- incidents board
- action modals with reason and impact preview

Need to expose existing backend actions in UI:

- kick participant
- start/live match actions from organizer panel

## Backend Gap Summary

Need to add or formalize:

- incident aggregate
- incident CRUD endpoints
- decision types
- replacement workflow
- technical match result actions
- refined participant status semantics
- mixed doubles pair-ranking parity

## Suggested Data Additions

### Option A: Minimal MVP

Add one table:

- `tournament_incidents`

Suggested columns:

- `id`
- `tournament_id`
- `division_id`
- `participant_id`
- `match_id`
- `type`
- `status`
- `reason`
- `evidence_url`
- `decision`
- `decision_note`
- `created_by`
- `resolved_by`
- `resolved_at`
- timestamps

### Option B: Extended Domain

Later split into:

- `tournament_incidents`
- `participant_status_logs`
- `match_decisions`

## Recommended MVP Sequence

1. build `ops` frontend shell
2. expose existing participant and match actions
3. add incident table and APIs
4. wire action modals to incident + status changes
5. add mixed doubles ranking parity
6. add replacement flow

## Immediate Risks

- existing `manage` page is already large; avoid adding all ops logic there
- status semantics must be normalized before building reports
- replacing members in pairs without incident/audit support will create silent data corruption risk
