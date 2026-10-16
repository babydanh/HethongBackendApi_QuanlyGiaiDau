## ADDED Requirements

### Requirement: Khách một mình trong nội dung đôi chờ ghép đôi

The system SHALL set a doubles participant holding exactly one athlete, counting an organizer-added guest without an account as one athlete, to `PENDING_PARTNER` when the organizer approves it, in every registration mode.

#### Scenario: Duyệt khách trong nội dung đôi

- **WHEN** the organizer approves a guest participant with no roster and `importedFrom` `ORGANIZER_DIRECT` in a doubles division
- **THEN** its status becomes `PENDING_PARTNER`

#### Scenario: Duyệt cặp khách đã đủ người

- **WHEN** the organizer approves a participant with no roster that is not a direct guest, or with two rosters
- **THEN** its status becomes `COMPLETE`

### Requirement: Ghép đôi nhận khách

The organizer pairing queue, manual pairing and random pairing SHALL accept a guest participant as one side. Gender restrictions SHALL be checked only for sides with an account. The surviving participant SHALL record both athletes in `customResponses` slots so the guest stays visible.

#### Scenario: Ghép khách với tài khoản

- **WHEN** the organizer pairs a waiting guest with a waiting account athlete in the same division
- **THEN** one participant becomes `COMPLETE` holding the account roster, its `customResponses` names both athletes, and the other participant becomes `WITHDRAWN`

#### Scenario: Ghép hai khách

- **WHEN** the organizer pairs two waiting guests
- **THEN** the pair becomes `COMPLETE` with no roster and both guest names in its slots

#### Scenario: Bên không đúng một người

- **WHEN** a side has no roster and is not a direct guest, or has two rosters
- **THEN** pairing is rejected

### Requirement: Tách cặp có khách

The organizer SHALL be able to unpair a manually paired participant that holds a guest, returning each athlete to its own `PENDING_PARTNER` participant.

#### Scenario: Tách cặp khách và tài khoản

- **WHEN** the organizer unpairs a manual pair of a guest and an account athlete
- **THEN** the guest returns as a guest participant `PENDING_PARTNER` with no roster, and the account athlete returns as a participant `PENDING_PARTNER` holding its roster
