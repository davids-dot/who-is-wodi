## ADDED Requirements

### Requirement: Game state machine
The system SHALL manage game state through a finite state machine with the following states: IDLE, DEALING, DESCRIBING, VOTING, RESULT, GAME_OVER. The system SHALL only allow valid state transitions.

#### Scenario: Initial state
- **WHEN** the server starts or game is reset
- **THEN** the game state SHALL be IDLE

#### Scenario: Start game transition
- **WHEN** user clicks "开始游戏" and current state is IDLE
- **THEN** the system SHALL transition to DEALING, assign word pairs and undercover identity, then automatically transition to DESCRIBING

#### Scenario: Next round transition
- **WHEN** user clicks "下一轮" and current state is RESULT (not game over)
- **THEN** the system SHALL transition to DESCRIBING for the next round

#### Scenario: Game over - undercover eliminated
- **WHEN** voting result eliminates a player and that player is the undercover
- **THEN** the system SHALL transition to GAME_OVER with winner "平民"

#### Scenario: Game over - undercover survives to final 2
- **WHEN** only 2 players remain and the undercover is still alive
- **THEN** the system SHALL transition to GAME_OVER with winner "卧底"

### Requirement: Word pair assignment
The system SHALL randomly select a word pair from the word library and randomly assign one player as undercover. 5 players SHALL receive the civilian word and 1 player SHALL receive the undercover word.

#### Scenario: Word assignment on game start
- **WHEN** a new game starts
- **THEN** the system SHALL randomly pick a word pair from the 50+ predefined pairs, randomly select one of the 6 players as undercover, and assign the undercover word to that player while assigning the civilian word to the other 5 players

#### Scenario: Identity persistence across rounds
- **WHEN** a new round begins (not a new game)
- **THEN** the undercover identity and word pair SHALL remain the same as the initial assignment

### Requirement: Player elimination
The system SHALL eliminate the player with the most votes after each voting round. If there is a tie, no player SHALL be eliminated.

#### Scenario: Clear winner in vote
- **WHEN** voting completes and one player has strictly more votes than all others
- **THEN** that player SHALL be eliminated and their identity revealed

#### Scenario: Tie in votes
- **WHEN** voting completes and two or more players share the highest vote count
- **THEN** no player SHALL be eliminated, and the game SHALL proceed to the next round

### Requirement: Round tracking
The system SHALL track the current round number and all description history across rounds.

#### Scenario: Round number increments
- **WHEN** a new round starts
- **THEN** the round counter SHALL increment by 1, starting from 1 for the first round

#### Scenario: History accumulation
- **WHEN** a player completes their description
- **THEN** the description SHALL be stored in the game history with player ID, player name, round number, description text, and timestamp

### Requirement: Game reset
The system SHALL allow resetting the game to initial state at any time.

#### Scenario: Reset during game
- **WHEN** user clicks "重置游戏" during any game state
- **THEN** all game state SHALL be cleared, all players SHALL be reset to active, and the state SHALL return to IDLE

### Requirement: Eliminated player behavior
The system SHALL exclude eliminated players from describing and voting in subsequent rounds.

#### Scenario: Eliminated player skips description
- **WHEN** a new description round starts and a player was eliminated in a previous round
- **THEN** that player SHALL be skipped in the description order

#### Scenario: Eliminated player does not vote
- **WHEN** voting phase starts and a player was eliminated
- **THEN** that player SHALL not participate in voting and their vote SHALL not be counted
