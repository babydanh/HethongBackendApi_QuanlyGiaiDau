# participant-import-seeding Specification

## Purpose
Cách gán hạt giống cho VĐV/đội khi nhập danh sách (batch Excel, import participants, Google Form): theo thứ tự dòng gửi lên trong từng nội dung, nối tiếp sau hạt giống lớn nhất đã có. Điểm trong file (ELO, DUPR) chỉ được giữ làm `importedElo`, không bao giờ thành hạt giống.

## Requirements

### Requirement: Imported entries are seeded in file order within their division

Every import path that writes participants (roster batch, participant import, Google Form import) SHALL give the i-th imported row of a division the seed `M + i`, where `M` is the highest seed already held in that division (0 when none) and `i` starts at 1 in the order the rows were sent.

#### Scenario: First import into an empty division

- **WHEN** a division with no participant is imported with 16 rows
- **THEN** the participants get seeds 1 to 16 in the order of the rows

#### Scenario: Import into a division that already has seeds

- **WHEN** a division already holds seeds 1 to 8 and 4 rows are imported into it
- **THEN** the new participants get seeds 9 to 12 and the existing seeds are unchanged

#### Scenario: Empty import

- **WHEN** a group carries no row
- **THEN** no participant is written and no seed changes

### Requirement: A score in the file never becomes a seed

The `elo` value of an imported row SHALL NOT be written to the participant's seed. It SHALL be kept with the participant's import metadata as `importedElo`.

#### Scenario: Row with a score

- **WHEN** the first row of an import into an empty division carries `elo: 1200`
- **THEN** its participant has seed 1 and `customResponses.importedElo` equal to 1200

#### Scenario: Row without a score

- **WHEN** a row carries no `elo`
- **THEN** its participant is still seeded by its order and has no `importedElo`
