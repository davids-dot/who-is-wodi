## ADDED Requirements

### Requirement: Decoupled Stream Rendering Hook
The system SHALL provide a `useStreamReceiver` hook to handle Server-Sent Events (SSE) chunks for typing animations, maintaining local state that does not trigger global re-renders.

#### Scenario: Receiving SSE Chunks
- **WHEN** an SSE chunk is received during the describing phase.
- **THEN** the `useStreamReceiver` hook SHALL append the chunk to its local state for the specific player ID without causing the parent component (`GamePage`) to re-render.

#### Scenario: Active Player Indication
- **WHEN** a `describe_start` or `thinking` event is received.
- **THEN** the hook SHALL update the `activePlayer` state (ID and type) to allow child components (like `RoundTable` or `DescriptionPanel`) to display appropriate visual cues.

#### Scenario: Resetting Stream State
- **WHEN** a new round starts or the game is reset.
- **THEN** the hook SHALL clear its local descriptions and active player state.
