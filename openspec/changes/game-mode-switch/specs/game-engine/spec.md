## MODIFIED Requirements

### Requirement: Game state machine
The system SHALL manage game state through a finite state machine with the following states: IDLE, DEALING, DESCRIBING, VOTING, RESULT, GAME_OVER. The system SHALL only allow valid state transitions. `startGame(gameId, mode)` SHALL accept a `mode` parameter (`'ai'` or `'participate'`) to select the player roster. `createInitialGame(mode)` SHALL initialize the player roster based on the mode.

#### Scenario: Initial state
- **WHEN** the server starts or game is reset
- **THEN** the game state SHALL be IDLE

#### Scenario: Start game transition
- **WHEN** user clicks "开始游戏" with a selected mode and current state is IDLE
- **THEN** the system SHALL transition to DEALING, select player roster based on mode, assign word pairs and undercover identity, then automatically transition to DESCRIBING

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
The system SHALL randomly select a word pair from the word library and randomly assign one player as undercover. 6 players SHALL receive the civilian word and 1 player SHALL receive the undercover word (total 7 players).

#### Scenario: Word assignment on game start
- **WHEN** a new game starts
- **THEN** the system SHALL randomly pick a word pair from the 50+ predefined pairs, randomly select one of the 7 players as undercover, and assign the undercover word to that player while assigning the civilian word to the other 6 players

#### Scenario: Identity persistence across rounds
- **WHEN** a new round begins (not a new game)
- **THEN** the undercover identity and word pair SHALL remain the same as the initial assignment

### Requirement: Game reset
The system SHALL allow resetting the game to initial state at any time. `resetGame(gameId, mode)` SHALL accept a `mode` parameter to determine the player roster for the new game instance.

#### Scenario: Reset during game
- **WHEN** user clicks "重置游戏" during any game state
- **THEN** all game state SHALL be cleared, all players SHALL be reset to active, and the state SHALL return to IDLE with the specified mode's player roster

#### Scenario: Reset with mode switch
- **WHEN** user resets the game with a different mode than the current game
- **THEN** the new game instance SHALL use the new mode's player roster, and the `mode` field SHALL be updated accordingly
