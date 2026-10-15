## ADDED Requirements

### Requirement: Workbook import applies rules and roster in one transaction

The system SHALL expose `POST /api/v1/tournaments/:id/workbook-import` that applies per-division rules and then imports the roster batch inside a single database transaction. If any step fails, the system SHALL persist nothing from the request.

#### Scenario: Rules and roster are both written

- **WHEN** a tournament manager posts valid `rules` for one division and a valid `roster` batch with a new `Idempotency-Key`
- **THEN** the response is HTTP 201 with `data.rulesApplied` = 1, `data.importedCount` equal to the imported participants and `data.replayed` = false
- **AND** the division row holds the new `roundConfig` and `maxParticipants`
- **AND** the participants of the batch exist in that division

#### Scenario: Roster failure rolls back the rules

- **WHEN** the rules are valid but the roster batch fails validation
- **THEN** the response is HTTP 400
- **AND** the division keeps its previous `roundConfig`, `maxParticipants` and `bracketType`
- **AND** no participant from the batch is created

#### Scenario: Capacity uses the imported limit

- **WHEN** the rules raise `maxParticipants` from 8 to 16 and the roster holds 12 teams
- **THEN** the import succeeds and 12 teams are created

### Requirement: Workbook import is idempotent

The commit endpoint SHALL require an `Idempotency-Key` header and SHALL return the first result without writing again when the same key is sent again for the same tournament.

#### Scenario: Replay returns the stored result

- **WHEN** the same request is sent twice with the same key
- **THEN** the second response is HTTP 201 with `data.replayed` = true and the same `importedCount`
- **AND** no extra participant is created

#### Scenario: Missing key

- **WHEN** the request has no `Idempotency-Key` header
- **THEN** the response is HTTP 400 and nothing is written

### Requirement: Workbook import keeps the existing division rule guards

Rules sent through workbook import SHALL be subject to every guard of `PATCH /tournaments/:id/divisions/:divisionId/config`.

#### Scenario: Division with a generated bracket

- **WHEN** a division in `rules` already has bracket stages
- **THEN** the commit response is HTTP 400 and nothing is written
- **AND** the preview reports the error under that `divisionId` without throwing

#### Scenario: Invalid sport rule

- **WHEN** `roundConfig` fails `validateSportRuleConfig` for the tournament category
- **THEN** the preview lists the error for that division and the commit response is HTTP 400

#### Scenario: Not a manager

- **WHEN** a user who does not manage the tournament calls preview or commit
- **THEN** the response is HTTP 403 and nothing is written

### Requirement: Workbook import preview writes nothing

The system SHALL expose `POST /api/v1/tournaments/:id/workbook-import/preview` that validates rules and roster and returns `data.rules` (errors per division) and `data.roster` (the existing roster batch preview) without writing to the database.

#### Scenario: Preview with valid input

- **WHEN** a manager previews valid rules and roster
- **THEN** the response is HTTP 200, every `data.rules[i].errors` is empty, and the database is unchanged

#### Scenario: Empty rules

- **WHEN** `rules` is an empty array and the roster is valid
- **THEN** the response is HTTP 200 with `data.rules` = [] and the roster preview filled

### Requirement: Existing endpoints keep their behaviour

`POST /tournaments/:id/roster-import-batches` and `PATCH /tournaments/:id/divisions/:divisionId/config` SHALL behave exactly as before this change.

#### Scenario: Roster batch endpoint unchanged

- **WHEN** the existing roster batch spec suite runs
- **THEN** every existing test passes without modification

#### Scenario: Division config endpoint unchanged

- **WHEN** the existing division service spec suite runs
- **THEN** every existing test passes without modification

### Requirement: Layout AI recognises a rules sheet

The roster layout AI SHALL accept `RULES` as a sheet kind and SHALL return no blocks for it.

#### Scenario: Rules kind accepted

- **WHEN** the AI layout output marks a sheet `RULES` with an empty `blocks` array
- **THEN** the layout validation accepts it and the response keeps `kind` = `RULES`

#### Scenario: Unknown kind rejected

- **WHEN** the AI layout output uses a kind outside `ROSTER | BRACKET | SCHEDULE | RULES | OTHER`
- **THEN** the layout is rejected the same way as before (`aiAvailable` true, `layout` null)
