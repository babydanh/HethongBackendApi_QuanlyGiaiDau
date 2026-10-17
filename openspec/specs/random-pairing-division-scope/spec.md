# random-pairing-division-scope Specification

## Purpose
Ghép ngẫu nhiên đôi chỉ trong một nội dung: khi giải có từ hai nội dung trở lên, Backend từ chối yêu cầu thiếu `divisionId` với thông báo "Vui lòng chọn nội dung để ghép đôi.", và không ghép chéo VĐV giữa các nội dung.

## Requirements

### Requirement: Random pairing requires a division when the tournament has several divisions

The system SHALL reject a `RANDOM` pairing request that omits `divisionId` when the tournament has two or more divisions. The system MUST respond with HTTP 400 and the message "Vui lòng chọn nội dung để ghép đôi.", and MUST NOT call the pairing transaction. The system MUST NOT pair athletes across divisions by default.

#### Scenario: Several divisions without divisionId

- **WHEN** the organizer calls `POST /tournaments/{id}/pairing/generate` with `strategy` `RANDOM` and no `divisionId`, and the tournament has two or more divisions
- **THEN** the system responds 400 with "Vui lòng chọn nội dung để ghép đôi." and does not call `generateLitePairsTx`

#### Scenario: One division without divisionId

- **WHEN** the tournament has exactly one division and `divisionId` is omitted
- **THEN** the system pairs within the tournament as before, and forwards `undefined` as the division

#### Scenario: divisionId provided

- **WHEN** the request carries a `divisionId`
- **THEN** the system forwards that `divisionId` to `generateLitePairsTx` unchanged
