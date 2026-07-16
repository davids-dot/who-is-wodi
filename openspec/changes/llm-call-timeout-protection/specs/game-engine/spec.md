## ADDED Requirements

### Requirement: Description generation retry on timeout
The system SHALL retry description generation once when an `LLM_TIMEOUT` error occurs. If the retry also fails, the system SHALL propagate the error to the SSE caller.

#### Scenario: First attempt times out, retry succeeds
- **WHEN** `generateDescription()` encounters an `LLM_TIMEOUT` error on the first LLM call
- **THEN** the system SHALL immediately retry the LLM call with the same parameters, and if the retry succeeds, yield the description chunks normally

#### Scenario: Both attempts time out
- **WHEN** both the first and retry attempts of `generateDescription()` encounter `LLM_TIMEOUT` errors
- **THEN** the system SHALL throw the error to the SSE caller without adding any description to `game.currentDescriptions`

### Requirement: Vote generation retry on timeout
The system SHALL retry vote generation once when an `LLM_TIMEOUT` error occurs. If the retry also fails, the system SHALL use the existing fallback random vote logic.

#### Scenario: Vote generation times out then succeeds
- **WHEN** `generateVote()` encounters an `LLM_TIMEOUT` error on the first LLM call
- **THEN** the system SHALL retry the LLM call, and if the retry succeeds, parse and return the vote normally

#### Scenario: Vote generation times out twice
- **WHEN** both attempts of `generateVote()` encounter `LLM_TIMEOUT` errors
- **THEN** the system SHALL use the existing fallback (random vote with reason "直觉投票") and mark `isFallback: true`

### Requirement: SSE player-level fault tolerance
The system SHALL catch errors thrown by individual player description generation in the SSE stream. When a player's description fails (after retry), the system SHALL emit a `player_error` SSE event and continue to the next player, rather than aborting the entire SSE stream.

#### Scenario: Player description fails, next player continues
- **WHEN** player N's description generation throws an error (after retry) during the SSE stream in `describe-batch` or `next-round` route
- **THEN** the system SHALL emit an SSE event `player_error` with `{ playerId, playerName, message }`, skip to player N+1, and continue the SSE stream normally

#### Scenario: All players fail
- **WHEN** every player's description generation fails in a single SSE stream
- **THEN** the system SHALL emit `player_error` for each player, then emit `round_complete` (or `user_turn` if applicable), and end the SSE stream without throwing an unhandled error

#### Scenario: First player succeeds, second fails, third succeeds
- **WHEN** player 1 describes successfully, player 2 times out (after retry), player 3 describes successfully
- **THEN** the system SHALL emit `describe_start`/`describe_chunk`/`describe_end` for player 1, `player_error` for player 2, `describe_start`/`describe_chunk`/`describe_end` for player 3, then continue the normal flow
