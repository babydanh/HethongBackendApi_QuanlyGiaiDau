# Spec Delta

## MODIFIED Requirements

### Requirement: Sơ đồ chỉ xếp đội hoàn chỉnh

Bracket generation and seeding SHALL seat only `COMPLETE` participants that are paid, waived by the organizer, or virtual, in every bracket format. A virtual athlete SHALL skip the payment rule but not the team rule.

#### Scenario: VĐV ảo đã ghép vào cặp

- **WHEN** four virtual athletes waiting for a partner in a doubles division are paired into two pairs and the bracket is generated
- **THEN** the bracket has one match seating the two pairs, not the withdrawn virtual rows
