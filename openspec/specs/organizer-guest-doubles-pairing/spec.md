# organizer-guest-doubles-pairing Specification

## Purpose
Khách BTC thêm không có tài khoản trong nội dung đôi chờ ghép, ghép và tách cặp được như VĐV có tài khoản.

## Requirements

### Requirement: Khách một mình trong nội dung đôi chờ ghép đôi

The system SHALL set a doubles participant holding exactly one athlete to `PENDING_PARTNER` when the organizer approves it, in every registration mode. An organizer-added guest without an account, and an organizer-imported entry (Excel, AI Excel, manual email, Google Form) that names only athlete 1, SHALL each count as one athlete.

#### Scenario: Duyệt khách trong nội dung đôi

- **WHEN** the organizer approves a guest participant with no roster and `importedFrom` `ORGANIZER_DIRECT` in a doubles division
- **THEN** its status becomes `PENDING_PARTNER`

#### Scenario: Duyệt mục nhập chỉ có VĐV 1

- **WHEN** the organizer approves an imported participant in a doubles division whose `customResponses` has no athlete 2 and that holds at most one roster
- **THEN** its status becomes `PENDING_PARTNER`

#### Scenario: Duyệt cặp khách đã đủ người

- **WHEN** the organizer approves a participant holding two athletes (two rosters, or an imported entry naming athlete 2), or a participant with no roster that is neither a direct guest nor an organizer import
- **THEN** its status becomes `COMPLETE`

### Requirement: Ghép đôi nhận khách

The organizer pairing queue, manual pairing and random pairing SHALL accept a guest participant or an imported single-athlete participant as one side. Organizer pairing, including adding athlete pairs, SHALL NOT check any gender restriction. The surviving participant SHALL record both athletes in `customResponses` slots so a guest stays visible.

#### Scenario: Ghép khách với tài khoản

- **WHEN** the organizer pairs a waiting guest with a waiting account athlete in the same division
- **THEN** one participant becomes `COMPLETE` holding the account roster, its `customResponses` names both athletes, and the other participant becomes `WITHDRAWN`

#### Scenario: Ghép hai khách

- **WHEN** the organizer pairs two waiting guests
- **THEN** the pair becomes `COMPLETE` with no roster and both guest names in its slots

#### Scenario: Ghép không xét giới tính

- **WHEN** the organizer pairs, manually or randomly, two account athletes of the same gender in a mixed doubles division, or an account athlete without a gender in a men's division
- **THEN** the pair is created

#### Scenario: Bên không đúng một người

- **WHEN** a side holds no athlete or two athletes
- **THEN** pairing is rejected

### Requirement: Tách cặp có khách

The organizer SHALL be able to unpair a manually paired participant that holds a guest, returning each athlete to its own `PENDING_PARTNER` participant.

#### Scenario: Tách cặp khách và tài khoản

- **WHEN** the organizer unpairs a manual pair of a guest and an account athlete
- **THEN** the guest returns as a guest participant `PENDING_PARTNER` with no roster, and the account athlete returns as a participant `PENDING_PARTNER` holding its roster

### Requirement: Nhập Excel nội dung đôi thiếu VĐV 2

An organizer import into a doubles division SHALL store a row that names only athlete 1 as one athlete waiting for a partner: `PENDING_PARTNER` when the row is approved on import, `PENDING_APPROVAL` otherwise.

#### Scenario: Dòng chỉ có VĐV 1

- **WHEN** the organizer imports, with automatic approval, a row in a doubles division that has athlete 1 and no athlete 2
- **THEN** the participant is `PENDING_PARTNER` and appears in the organizer pairing queue

#### Scenario: Dòng đủ hai VĐV

- **WHEN** the organizer imports, with automatic approval, a doubles row naming both athletes
- **THEN** the participant is `COMPLETE`

### Requirement: Nội dung mặc định của giải tạo nhanh

Creating a quick tournament for a non-football sport with no divisions and no explicit format SHALL create one division named "Đôi Linh Hoạt" with match type `DOUBLES` and no gender restriction.

#### Scenario: Tạo nhanh không chọn thể thức

- **WHEN** the organizer creates a quick badminton tournament with `divisions: []` and no `format`
- **THEN** the tournament has exactly one division "Đôi Linh Hoạt", match type `DOUBLES`, gender restriction empty

#### Scenario: Tạo nhanh có chọn thể thức

- **WHEN** the request sets `format` `singles`
- **THEN** the default division is a singles division as before

### Requirement: Sơ đồ chỉ xếp đội hoàn chỉnh

Bracket generation and seeding SHALL seat only `COMPLETE` participants; a virtual athlete SHALL skip the payment rule but not the team rule.

#### Scenario: VĐV ảo đã ghép vào cặp

- **WHEN** four virtual athletes waiting for a partner in a doubles division are paired into two pairs and the bracket is generated
- **THEN** the bracket has one match seating the two pairs, not the withdrawn virtual rows
