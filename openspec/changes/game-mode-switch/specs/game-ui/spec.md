## MODIFIED Requirements

### Requirement: Game control buttons
The system SHALL provide control buttons: "开始游戏" (start), "下一轮" (next round), "投票" (vote), and "重置游戏" (reset). Button availability SHALL depend on current game state. Before game start, the system SHALL display a mode selector (Radio group) with two options: "AI 观战" and "亲自参与". The selected mode SHALL be passed to the start game API call.

#### Scenario: IDLE state controls with mode selector
- **WHEN** game is in IDLE state (not started)
- **THEN** the system SHALL display a mode selector with "AI 观战" and "亲自参与" options, and only "开始游戏" SHALL be enabled; "下一轮", "投票", and "重置" SHALL be disabled

#### Scenario: DESCRIBING state controls
- **WHEN** game is in DESCRIBING state (SSE stream active)
- **THEN** all control buttons SHALL be disabled until the round completes

#### Scenario: After description round controls
- **WHEN** description round completes and state is ready for voting
- **THEN** "投票" button SHALL be enabled

#### Scenario: RESULT state controls
- **WHEN** game is in RESULT state and not GAME_OVER
- **THEN** "下一轮" button SHALL be enabled

#### Scenario: Mode selector hidden during game
- **WHEN** game has started (any state other than IDLE)
- **THEN** the mode selector SHALL be hidden; it SHALL only be visible again after game reset

### Requirement: Game status header
The system SHALL display a header showing current round number, remaining player count, and current game phase. The header SHALL NOT show "观战中" indicator in AI 观战 mode since there is no human player.

#### Scenario: Status display during game
- **WHEN** game is in progress
- **THEN** the header SHALL show "第N轮 | 剩余M人 | [当前阶段]" where phase is one of: 发牌中, 描述中, 投票中, 结果展示

#### Scenario: AI 观战模式无观战指示
- **WHEN** AI 观战模式下游戏进行中
- **THEN** header SHALL NOT display "观战中" indicator, because all players are AI

#### Scenario: 参与模式用户被淘汰后显示观战
- **WHEN** 参与模式用户被淘汰且游戏未结束
- **THEN** header SHALL display "观战中" indicator next to the phase
