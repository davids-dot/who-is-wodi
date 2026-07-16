## ADDED Requirements

### Requirement: Frontend Game Engine FSM

The system SHALL use a finite state machine (`useGameEngine` hook) to manage the game lifecycle phases, completely decoupled from the main UI component rendering logic.

#### Scenario: Start Game

- **WHEN** the user initiates a game start action.
- **THEN** the engine state transitions to `IDLE` and initiates a backend sync.

#### Scenario: Syncing with Backend State

- **WHEN** the backend game state is fetched (e.g., on mount or after an action).
- **THEN** the frontend engine SHALL evaluate the backend state (`IDLE`, `DESCRIBING`, `VOTING`, etc.) and the user's survival status to transition to the appropriate frontend phase (e.g., `WAITING_USER_DESC`, `VOTING_AI`).

#### Scenario: Transitioning through Describing Phase

- **WHEN** the first batch of AI finishes describing.
- **THEN** the engine SHALL transition to `WAITING_USER_DESC` if the human player is alive and it's their turn, otherwise it SHALL transition directly to `DESCRIBING_AI_2`.

#### Scenario: Transitioning through Voting Phase

- **WHEN** the AI voting process completes.
- **THEN** the engine SHALL transition to `WAITING_USER_VOTE` if the human player is alive, allowing them to cast a vote.

### Requirement: Centralized Game Actions

The `useGameEngine` hook SHALL expose a unified set of actions (e.g., `startGame`, `nextRound`, `submitUserDescribe`, `submitUserVote`) that components can invoke without needing to know the underlying API details.

#### Scenario: User Submits Description

- **WHEN** the user submits a text description.
- **THEN** the engine SHALL call the corresponding API, update its internal state to reflect the submission, and transition to the next phase (`DESCRIBING_AI_2`).
