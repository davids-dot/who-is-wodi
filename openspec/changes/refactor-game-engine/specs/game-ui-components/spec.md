## MODIFIED Requirements

### Requirement: Modular Game Page UI
The `GamePage` component SHALL be composed of smaller, focused sub-components rather than a single monolithic file.

#### Scenario: Rendering the Header
- **WHEN** the `GamePage` renders.
- **THEN** it SHALL use a `HeaderBar` component to display the round number, phase text, and player's word, receiving these values as props from the game engine state.

#### Scenario: Rendering User Actions
- **WHEN** the engine phase is `WAITING_USER_DESC` or `WAITING_USER_VOTE`.
- **THEN** it SHALL render a `UserActionCard` component configured for the specific action type, hiding it during other phases.

#### Scenario: Rendering the Round Table
- **WHEN** the game is active.
- **THEN** it SHALL render the `RoundTable` component, passing only the necessary player data, active player status from the stream receiver, and final vote results.

#### Scenario: Rendering the Description Panel
- **WHEN** descriptions are being generated or viewed.
- **THEN** it SHALL render the `DescriptionPanel`, passing the localized stream descriptions and active player status to avoid global re-renders.
