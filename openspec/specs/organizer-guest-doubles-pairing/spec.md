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

An organizer import into a doubles division SHALL store a row that names only athlete 1 as one athlete waiting for a partner: `PENDING_PARTNER` when the row is approved on import, `PENDING_APPROVAL` otherwise. An organizer-imported row SHALL NOT wait for approval because of its fee.

#### Scenario: Dòng chỉ có VĐV 1

- **WHEN** the organizer imports, with automatic approval, a row in a doubles division that has athlete 1 and no athlete 2
- **THEN** the participant is `PENDING_PARTNER` and appears in the organizer pairing queue

#### Scenario: Dòng đủ hai VĐV

- **WHEN** the organizer imports, with automatic approval, a doubles row naming both athletes
- **THEN** the participant is `COMPLETE`

#### Scenario: Dòng có phí chưa đóng không chờ duyệt

- **WHEN** the organizer imports, with automatic approval, a row in a paid division that is not marked as paid
- **THEN** the participant is not `PENDING_APPROVAL` and is recorded with `isPaid` true and `organizerWaivedFee` true

### Requirement: Nội dung mặc định của giải tạo nhanh

Creating a quick tournament for a non-football sport with no divisions SHALL create one division with no gender restriction, named by its format. A gender label SHALL appear in a name only when the request sets that gender.

#### Scenario: Tạo nhanh không chọn thể thức

- **WHEN** the organizer creates a quick badminton tournament with `divisions: []` and no `format`
- **THEN** the tournament has exactly one division "Đôi linh hoạt", match type `DOUBLES`, gender restriction empty

#### Scenario: Tạo nhanh có chọn thể thức

- **WHEN** the request sets `format` `singles` with no gender
- **THEN** the default division is "Đơn linh hoạt" with match type `SINGLES`

### Requirement: Sơ đồ chỉ xếp đội hoàn chỉnh

Bracket generation and seeding SHALL seat only `COMPLETE` participants that are paid, waived by the organizer, or virtual, in every bracket format. A virtual athlete SHALL skip the payment rule but not the team rule.

#### Scenario: VĐV ảo đã ghép vào cặp

- **WHEN** four virtual athletes waiting for a partner in a doubles division are paired into two pairs and the bracket is generated
- **THEN** the bracket has one match seating the two pairs, not the withdrawn virtual rows

### Requirement: Giải tạo nhanh đôi nam nữ

A quick tournament created with `format` `mixed_doubles` SHALL have match type `MIXED_DOUBLES` and gender restriction `MIXED` on the tournament and its division.

#### Scenario: Tạo nhanh đôi nam nữ

- **WHEN** the request sets `format` `mixed_doubles`
- **THEN** the tournament and its division have match type `MIXED_DOUBLES` and gender restriction `MIXED`

### Requirement: Người do BTC thêm đã đóng phí

Every participant the organizer adds (a direct guest, an account pair, an Excel row, a club member) SHALL be recorded as fee-settled: `isPaid` true and `organizerWaivedFee` true. The fee SHALL NOT place such a participant in `PENDING_APPROVAL`.

#### Scenario: BTC thêm khách vào nội dung đôi có phí

- **WHEN** the organizer adds a guest to a paid doubles division
- **THEN** the participant is `PENDING_PARTNER`, `isPaid` is true, `organizerWaivedFee` is true, and it appears in the organizer pairing queue

#### Scenario: BTC thêm VĐV tài khoản có phí

- **WHEN** the organizer adds one account athlete to a paid doubles division
- **THEN** the participant is `PENDING_PARTNER`, `isPaid` is true, and `organizerWaivedFee` is true

### Requirement: Cặp do BTC ghép đã đóng phí

A pair the organizer makes (manually, in batch, or randomly) in a lite tournament SHALL record the surviving participant as fee-settled (`isPaid` true, `organizerWaivedFee` true), so a paid tournament seats the pair in its bracket like a waived one.

#### Scenario: Ghép tay trong giải có phí

- **WHEN** the organizer pairs two waiting athletes of a paid lite doubles tournament
- **THEN** the surviving participant is `COMPLETE`, `isPaid` is true, `organizerWaivedFee` is true, and the bracket seeding includes it

#### Scenario: Ghép ngẫu nhiên trong giải có phí

- **WHEN** the organizer generates random pairs in a paid lite doubles tournament
- **THEN** every formed pair is `COMPLETE` with `isPaid` true and `organizerWaivedFee` true

### Requirement: Duyệt VĐV do BTC thêm trước khi giải bắt đầu

The organizer SHALL be able to approve a participant the organizer added (`organizerWaivedFee` true, or `importedFrom` naming an organizer source) while the tournament has not started, including after registration closed. Self-registered participants SHALL keep the registration-open gate. Adding new participants after registration closed SHALL remain rejected.

#### Scenario: Khách kẹt sau khi đóng đăng ký

- **WHEN** the organizer approves a guest left in `PENDING_APPROVAL` after the tournament moved to `REGISTRATION_CLOSED`
- **THEN** the guest becomes `PENDING_PARTNER`

#### Scenario: VĐV tự đăng ký sau khi đóng

- **WHEN** the organizer approves a self-registered participant after `REGISTRATION_CLOSED`
- **THEN** the approval is rejected

#### Scenario: Giải đã bắt đầu

- **WHEN** the organizer approves an organizer-added participant in an `IN_PROGRESS` tournament
- **THEN** the approval is rejected

### Requirement: Tách cặp do BTC tạo

The organizer SHALL be able to unpair a manual pair whose rows were created by the organizer. When no roster belongs to the row's `registeredBy`, the leader SHALL be the first roster in stable `id` order, and the partner SHALL take its own account as `registeredBy` when it is an account athlete.

#### Scenario: Tách cặp hai tài khoản do BTC tạo

- **WHEN** the organizer unpairs a manual pair of two account athletes created by the organizer
- **THEN** the leader is the first roster and the partner becomes its own `PENDING_PARTNER` participant with `registeredBy` set to the partner account

### Requirement: Sức chứa cặp có khách

A pair holding a guest SHALL occupy one full team, whichever side is the self-registered athlete. Writing the pair's slots SHALL mark the pair as imported so capacity counts both athletes.

#### Scenario: VĐV tự đăng ký ghép với khách

- **WHEN** a self-registered athlete is paired with a guest
- **THEN** the pair occupies one team in capacity, not half a team

### Requirement: BTC thêm thành viên CLB không kiểm giới tính

Adding a club member to a lite tournament as the organizer SHALL NOT check the division gender restriction. Self-registration and partner acceptance SHALL keep the check.

#### Scenario: BTC thêm nữ CLB vào nội dung Nam

- **WHEN** the organizer adds a female club member to a division restricted to men
- **THEN** the member is added

#### Scenario: Nữ tự đăng ký nội dung Nam

- **WHEN** a female athlete registers herself for a division restricted to men
- **THEN** the registration is rejected with "Division này chỉ dành cho Nam."

### Requirement: Ghép ngẫu nhiên theo nội dung và báo người lẻ

Random pairing SHALL pair only within the requested division when a division is given. It SHALL NOT swallow errors other than the fewer-than-two-waiting condition, which uses the constant message `LITE_NO_PAIRABLE_MESSAGE`. Its result SHALL list each formed pair with both member names and any leftover athlete's name.

#### Scenario: Ghép ngẫu nhiên chỉ trong một nội dung

- **WHEN** random pairing is requested with a division id
- **THEN** only participants of that division are paired

#### Scenario: Số người lẻ

- **WHEN** an odd number of waiting athletes is paired randomly
- **THEN** the result lists the leftover athlete's name in `unpairedNames`

#### Scenario: Lỗi khác không bị nuốt

- **WHEN** a pair fails for a reason other than fewer than two waiting participants
- **THEN** the error is thrown, not reported as success

### Requirement: Đồng bộ hình thức giải lite với nội dung

For a lite tournament, the tournament-level match type and gender restriction SHALL follow its divisions whenever a division is created or its match type or gender restriction changes. When all divisions share a match type, the tournament takes it; otherwise it takes `DOUBLES` if any division is doubles or mixed doubles, and `SINGLES` if none is.

#### Scenario: Đổi nội dung đầu sang đôi

- **WHEN** a lite tournament with a singles division and a doubles division has its first division changed to doubles
- **THEN** the tournament-level match type is `DOUBLES`
