# Organizer Ops Panel MVP Roadmap

## Objective

Deliver an organizer-facing operations panel for tournaments that are no longer purely in setup mode.

Target route:

- `/organizer/tournaments/[id]/ops`

Implementation location:

- frontend route at `src/app/organizer/tournaments/[id]/ops/page.tsx`
- frontend business logic under `src/features/organizer/ops/`
- backend changes distributed across:
  - `src/modules/tournaments`
  - `src/modules/matches`
  - `src/modules/rankings`

## Phase 0: Freeze Business Terms

Deliverables:

- final participant status list
- final incident type list
- decision matrix for withdrawal, kick, injury, no-show, disqualification, replacement

Output:

- approved business vocabulary for frontend labels and backend enums

## Phase 1: Frontend Ops Shell

Goal:

- create the organizer operations route and layout without changing backend yet

Frontend work:

- add `ops/page.tsx`
- keep it as a sibling of `manage/page.tsx`
- add workspace navigation:
  - overview
  - participants
  - matches
  - incidents
  - finance
- reuse existing API calls for:
  - tournament detail
  - participants
  - bracket or matches

Acceptance:

- organizer can open one route and see tournament operational summary

## Phase 2: Participants Workspace

Goal:

- manage pair and team lifecycle clearly

Frontend work:

- participants table
- filters
- participant drawer
- action buttons for:
  - approve
  - reject
  - withdraw
  - kick

Backend work:

- verify current status patch semantics
- optionally introduce `REJECTED`
- expose kick action cleanly if not already surfaced in API client

Acceptance:

- organizer can process participant decisions without using registration tab directly

## Phase 3: Matches Workspace

Goal:

- give organizer a queue-first view of match operations

Frontend work:

- match queue by court and status
- start match action
- open live control action
- assign court and referee quick actions

Backend work:

- reuse existing match status and schedule endpoints

Acceptance:

- organizer can move a scheduled match into play from the ops panel

## Phase 4: Incident MVP

Goal:

- make abnormal operational decisions explicit

Backend work:

- add `tournament_incidents` table
- add create/list/resolve incident endpoints
- support incident types:
  - `INJURY`
  - `NO_SHOW`
  - `DISQUALIFICATION`
  - `WALKOVER`
  - `ROSTER_VIOLATION`

Frontend work:

- incidents workspace
- create incident modal
- resolve incident modal
- link incident creation from participant and match actions

Acceptance:

- organizer decisions are auditable and visible in one log

## Phase 5: Technical Decisions on Matches

Goal:

- operationalize results that are not simple score-entry results

Backend additions:

- walkover action
- injury retirement action
- disqualification action
- optional void action

Frontend additions:

- action menu on match rows
- impact preview before confirmation

Acceptance:

- organizer can resolve no-show, injury, and rules violations without manual score hacks

## Phase 6: Doubles and Mixed Doubles Corrections

Goal:

- support pair-specific operations

Backend work:

- replacement validation flow
- mixed doubles pair-ranking parity with doubles branch
- audit log for replacement decisions

Frontend work:

- replace member modal
- pair validation preview

Acceptance:

- organizer can manage real doubles incidents safely

## Non-Goals for MVP

- automatic reseeding after any late replacement
- multi-level referee permission matrix redesign
- full payments dispute engine
- bulk participant actions

## Technical Guidance

- keep `manage` as configuration
- keep `ops` as execution
- reuse existing components only when they fit; do not keep growing `manage/page.tsx`
- extract shared helpers and data hooks where possible

## Recommended File Structure

Frontend:

```text
src/app/organizer/tournaments/[id]/ops/page.tsx
src/app/organizer/tournaments/[id]/ops/components/OpsOverview.tsx
src/app/organizer/tournaments/[id]/ops/components/OpsParticipants.tsx
src/app/organizer/tournaments/[id]/ops/components/OpsMatches.tsx
src/app/organizer/tournaments/[id]/ops/components/OpsIncidents.tsx
src/app/organizer/tournaments/[id]/ops/components/OpsFinance.tsx
src/features/tournaments/hooks/useOrganizerOps.ts
```

Backend:

```text
src/modules/tournaments/dto/create-tournament-incident.dto.ts
src/modules/tournaments/dto/resolve-tournament-incident.dto.ts
src/modules/tournaments/exceptions/
src/modules/tournaments/tournament-incidents.service.ts
```

## Exit Criteria for MVP

- organizer can manage approved and pending pairs from one panel
- organizer can operate match queue from one panel
- organizer can record and resolve operational incidents
- pair operations are clear enough for doubles and mixed doubles tournaments
