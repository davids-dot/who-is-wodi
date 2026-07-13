## ADDED Requirements

### Requirement: Round table layout
The system SHALL display 6 player seats arranged in a circular layout, with player avatars (emoji), names, and status indicators (active/eliminated) visible at all times.

#### Scenario: Circular seat arrangement
- **WHEN** the game page is rendered
- **THEN** 6 player seats SHALL be positioned in a circular layout: P1 at top, P2 at upper-right, P3 at lower-right, P4 at bottom, P5 at lower-left, P6 at upper-left

#### Scenario: Eliminated player visual
- **WHEN** a player is eliminated
- **THEN** their seat SHALL display a visual indicator (grayscale/dimmed) and show their identity (平民/卧底) overlaid on the avatar

### Requirement: Description bubble display
The system SHALL display each player's description as a speech bubble near their seat, with a typewriter effect as SSE chunks arrive.

#### Scenario: Typewriter effect during description
- **WHEN** SSE describe_chunk events arrive for a player
- **THEN** the text SHALL appear progressively in a speech bubble near that player's seat, with the currently-speaking player highlighted

#### Scenario: All descriptions visible after round
- **WHEN** a description round completes (round_complete event)
- **THEN** all players' descriptions for the current round SHALL remain visible in their speech bubbles

### Requirement: Vote result panel
The system SHALL display voting results after all votes are collected, showing who voted for whom and the vote tally.

#### Scenario: Vote display
- **WHEN** voting results are returned
- **THEN** the system SHALL display each player's vote target and reason, and highlight the eliminated player (if any) with their identity reveal

#### Scenario: Tie display
- **WHEN** voting results in a tie
- **THEN** the system SHALL display "平票！无人淘汰，继续下一轮" and no player is eliminated

### Requirement: Game control buttons
The system SHALL provide control buttons: "开始游戏" (start), "下一轮" (next round), "投票" (vote), and "重置游戏" (reset). Button availability SHALL depend on current game state.

#### Scenario: IDLE state controls
- **WHEN** game is in IDLE state
- **THEN** only "开始游戏" SHALL be enabled; "下一轮", "投票", and "重置" SHALL be disabled

#### Scenario: DESCRIBING state controls
- **WHEN** game is in DESCRIBING state (SSE stream active)
- **THEN** all control buttons SHALL be disabled until the round completes

#### Scenario: After description round controls
- **WHEN** description round completes and state is ready for voting
- **THEN** "投票" button SHALL be enabled

#### Scenario: RESULT state controls
- **WHEN** game is in RESULT state and not GAME_OVER
- **THEN** "下一轮" button SHALL be enabled

### Requirement: History panel
The system SHALL provide a collapsible history panel showing all past rounds' descriptions and voting results.

#### Scenario: History entry per round
- **WHEN** a round completes
- **THEN** a history entry SHALL be added containing: round number, all players' descriptions, all votes, and elimination result

#### Scenario: History panel toggle
- **WHEN** user clicks the history toggle button
- **THEN** the history panel SHALL slide in/out from the right side without obscuring the main game area

### Requirement: Game over display
The system SHALL display a prominent game-over screen showing the winner (平民/卧底), the undercover player's identity, and a "再来一局" (play again) button.

#### Scenario: Civilian victory
- **WHEN** undercover is eliminated
- **THEN** the system SHALL display "平民胜利！" with the undercover player highlighted and their word revealed

#### Scenario: Undercover victory
- **WHEN** undercover survives to final 2 players
- **THEN** the system SHALL display "卧底胜利！" with the undercover player highlighted and both words (civilian and undercover) revealed

### Requirement: Game status header
The system SHALL display a header showing current round number, remaining player count, and current game phase.

#### Scenario: Status display during game
- **WHEN** game is in progress
- **THEN** the header SHALL show "第N轮 | 剩余M人 | [当前阶段]" where phase is one of: 发牌中, 描述中, 投票中, 结果展示
