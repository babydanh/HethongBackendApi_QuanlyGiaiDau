# Spec Delta

## MODIFIED Requirements

### Requirement: Điều kiện đội hợp lệ thống nhất cho mọi thể thức

The system SHALL count a participant as a team for every bracket format only when `teamStatus` is `COMPLETE` and the registration is settled: paid, waived by the organizer, virtual (`isMock`), or free at registration (`entryFeeAtRegistration` null or <= 0). The minimum number of teams per format SHALL be defined in one place. The rejection message SHALL say "cặp" for a doubles division and "đội" for a singles division.

#### Scenario: Cùng bốn cặp COMPLETE, đã đóng phí

- **WHEN** four doubles pairs are `COMPLETE` and paid, and the division is generated as single elimination or group stage and knockout
- **THEN** both formats seat the same four pairs and neither rejects on the team count

#### Scenario: Cặp COMPLETE chưa đóng phí

- **WHEN** a `COMPLETE` pair with a registration fee greater than zero is neither paid nor waived nor virtual
- **THEN** it is excluded from the bracket of every format

#### Scenario: Cặp đăng ký miễn phí chưa có cờ đã đóng

- **WHEN** a `COMPLETE` pair has `isPaid=false`, is not waived, and its `entryFeeAtRegistration` is 0 or null
- **THEN** it is seated in the bracket like a paid pair

#### Scenario: Thiếu cặp ở nội dung đôi

- **WHEN** a doubles division has one eligible pair and the bracket is requested as single elimination
- **THEN** the rejection reads "Cần ít nhất 2 cặp để tạo sơ đồ loại trực tiếp."

#### Scenario: Thiếu đội ở nội dung đơn

- **WHEN** a singles division has one eligible participant
- **THEN** the rejection reads "Cần ít nhất 2 đội để tạo sơ đồ loại trực tiếp"
