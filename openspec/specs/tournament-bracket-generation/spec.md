# tournament-bracket-generation Specification

## Purpose
TBD - created by archiving change fix-bracket-doubles-generation. Update Purpose after archive.

## Requirements

### Requirement: Giải nhiều nội dung phải chọn nội dung khi tạo sơ đồ

The system SHALL reject a bracket generation request for a tournament with more than one division when no `divisionId` is given, on both the generic and the lite route, with the message "Vui lòng chọn nội dung để tạo sơ đồ.". A tournament with exactly one division SHALL use that division when no `divisionId` is given. A generation for one division SHALL read only that division's participants and soft-delete only that division's stages.

#### Scenario: Giải hai nội dung không truyền nội dung

- **WHEN** the organizer generates a bracket for a tournament with two divisions and no `divisionId`
- **THEN** the request is rejected with 400 "Vui lòng chọn nội dung để tạo sơ đồ." and no stage is written

#### Scenario: Giải lite hai nội dung không truyền nội dung

- **WHEN** a lite tournament with two divisions receives a bracket request without `divisionId`
- **THEN** the request is rejected with the same 400 and no pairing or stage is written

#### Scenario: Giải một nội dung không truyền nội dung

- **WHEN** a tournament with one division receives a bracket request without `divisionId`
- **THEN** the bracket is generated for that division

#### Scenario: Tạo cho một nội dung không ảnh hưởng nội dung khác

- **WHEN** a division "Đôi Nam" is generated while "Đôi Nữ" already has a bracket
- **THEN** only the "Đôi Nam" participants are seated and only its stages are soft-deleted

### Requirement: Điều kiện đội hợp lệ thống nhất cho mọi thể thức

The system SHALL count a participant as a team for every bracket format (single elimination, double elimination, round robin, group stage and knockout) only when `teamStatus` is `COMPLETE` and the participant is paid, waived by the organizer, or virtual (`isMock`). The minimum number of teams per format SHALL be defined in one place. The rejection message SHALL say "cặp" for a doubles division and "đội" for a singles division.

#### Scenario: Cùng bốn cặp COMPLETE, đã đóng phí

- **WHEN** four doubles pairs are `COMPLETE` and paid, and the division is generated as single elimination or group stage and knockout
- **THEN** both formats seat the same four pairs and neither rejects on the team count

#### Scenario: Cặp COMPLETE chưa đóng phí

- **WHEN** a `COMPLETE` pair is neither paid nor waived nor virtual
- **THEN** it is excluded from the bracket of every format

#### Scenario: Thiếu cặp ở nội dung đôi

- **WHEN** a doubles division has one eligible pair and the bracket is requested as single elimination
- **THEN** the rejection reads "Cần ít nhất 2 cặp để tạo sơ đồ loại trực tiếp."

#### Scenario: Thiếu đội ở nội dung đơn

- **WHEN** a singles division has one eligible participant
- **THEN** the rejection reads "Cần ít nhất 2 đội để tạo sơ đồ loại trực tiếp"

### Requirement: Tạo sơ đồ đôi lite tự ghép trong nội dung và báo kết quả

When a lite doubles tournament generates a bracket, the system SHALL first pair the waiting athletes at random within the requested division only. Only the error stating that no waiting athletes remain SHALL be ignored; every other pairing error SHALL be raised. The response SHALL list each automatic pair with its participant id and athlete names, and the athletes left unpaired, so the organizer sees them.

#### Scenario: Ghép tự động trong đúng nội dung

- **WHEN** a lite doubles division has six waiting athletes and the bracket is generated for it
- **THEN** only those six are paired at random, the response lists the pairs with `memberNames`, and the bracket seats the resulting pairs

#### Scenario: Người lẻ được báo

- **WHEN** an odd number of waiting athletes remains after automatic pairing
- **THEN** the response lists the leftover athlete in `unpairedNames`

#### Scenario: Không còn ai để ghép

- **WHEN** fewer than two waiting athletes remain
- **THEN** the bracket is generated from the existing pairs and no error is returned

#### Scenario: Lỗi ghép thật được ném ra

- **WHEN** automatic pairing fails with an error other than "no waiting athletes remain"
- **THEN** the bracket request fails with that error and no stage is written

### Requirement: Không tạo lại sơ đồ đã chốt hoặc đã có trận bắt đầu

The system SHALL default `allowReset` to false. A bracket that already exists SHALL NOT be regenerated after registration is closed or upcoming unless `allowReset` is true. A division with any match that has started or completed SHALL NOT be regenerated, even with `allowReset` true. A generation SHALL lock the tournament row and check for started matches inside the same transaction that soft-deletes and inserts, so two concurrent requests leave exactly one active stage per division.

#### Scenario: Mặc định không cho tạo lại sau khi đóng đăng ký

- **WHEN** the generate-bracket request omits `allowReset` and the bracket exists after registration is closed
- **THEN** the request is rejected with "Sơ đồ bảng đấu đã được chốt. Không thể tạo lại sau khi đăng ký đóng."

#### Scenario: Có trận đã bắt đầu

- **WHEN** a division has a match that is not scheduled, and `allowReset` is true
- **THEN** the request is rejected with "Không thể tạo lại sơ đồ sau khi đã bắt đầu ít nhất một trận." and the stages remain

#### Scenario: Hai yêu cầu cùng lúc

- **WHEN** two generation requests for the same division run concurrently
- **THEN** they run one after another on the locked tournament row, and afterwards exactly one stage of that division is not deleted

### Requirement: Sơ đồ hai lượt xếp đủ đội ở vòng 1

For a two-legged tournament, each round-one tie SHALL consist of a leg 1 and a leg 2 match. The two legs of a tie with two teams SHALL contain the same two teams in swapped roles and SHALL both be scheduled. A tie with a missing team SHALL be a bye on both legs with the present team as winner.

#### Scenario: Bốn đội hai lượt

- **WHEN** four teams are seated in a two-legged bracket
- **THEN** all four teams appear in round one, each tie has two scheduled legs, and no leg is completed automatically

#### Scenario: Ba đội hai lượt

- **WHEN** three teams are seated in a two-legged bracket
- **THEN** the tie with one team is a bye on both legs, and the other tie has two scheduled legs

### Requirement: Thể thức không nhận diện được bị từ chối

The system SHALL reject a bracket generation whose division bracket type is not single elimination, double elimination, round robin, or group stage and knockout, with a message naming the unsupported type. The system SHALL NOT fall back to single elimination. `GROUP_STAGE_THEN_KNOCKOUT` has no generator and SHALL be rejected by this rule.

#### Scenario: Thể thức vòng bảng rồi loại trực tiếp

- **WHEN** a division has bracket type `GROUP_STAGE_THEN_KNOCKOUT`
- **THEN** the request is rejected with a 400 naming the type, and no stage is written

### Requirement: Chốt giải tạo sơ đồ theo từng nội dung

When a tournament with more than one division is locked, the system SHALL generate a bracket for each division separately, so that no division's participants are mixed into another's bracket.

#### Scenario: Chốt giải hai nội dung

- **WHEN** a tournament with two divisions is locked
- **THEN** two brackets are generated, one per division, each seated only with its own participants
