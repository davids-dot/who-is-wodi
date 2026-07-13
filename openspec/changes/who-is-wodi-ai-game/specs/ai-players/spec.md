## ADDED Requirements

### Requirement: AI player personalities
The system SHALL define 6 AI players, each with a unique name, avatar (emoji), and personality description that influences their speaking style.

#### Scenario: Player roster
- **WHEN** the game initializes
- **THEN** the system SHALL have exactly 6 players: 老王(🤓理性分析师), 小美(😎时尚达人), 阿强(🥸搞笑担当), 大刘(😤暴脾气直性子), Lily(🤠海归留学生), 老张(🥱高冷大叔)

### Requirement: Description generation
The system SHALL call LLM for each active player in sequence (P1→P6) to generate a one-sentence description of their assigned word. Each player's prompt SHALL include all previous descriptions from the current and prior rounds to avoid repetition.

#### Scenario: First player describes in round 1
- **WHEN** P1 (first player) generates a description in round 1
- **THEN** the prompt SHALL contain the player's word, personality, and the instruction to describe in one sentence (20-50 characters) without repeating any prior descriptions

#### Scenario: Subsequent player describes
- **WHEN** player Pn (n>1) generates a description
- **THEN** the prompt SHALL include all descriptions from P1 to P(n-1) in the current round, plus all descriptions from all prior rounds, with instruction to not repeat or be similar to any of them

#### Scenario: Undercover player receives same prompt structure
- **WHEN** the undercover player generates a description
- **THEN** the prompt structure SHALL be identical to civilian players, with the only difference being the word value. The prompt SHALL NOT contain any indication of the player's undercover identity

### Requirement: Forbidden character rule as soft rule
The system SHALL inform each player in the prompt about the forbidden character rule: "your description should not contain any character from your assigned word." This is a game rule, not a hard constraint. The system SHALL NOT filter or reject descriptions that violate this rule.

#### Scenario: Forbidden characters included in prompt
- **WHEN** any player's description prompt is constructed
- **THEN** the prompt SHALL state the forbidden character rule and list the specific characters from the player's word that should be avoided

#### Scenario: Violation not blocked
- **WHEN** a player's generated description contains a forbidden character
- **THEN** the system SHALL accept the description as-is without filtering, retrying, or modification

### Requirement: Voting with forbidden character awareness
The system SHALL instruct each player in the voting prompt to consider whether other players may have violated the forbidden character rule as a clue for identifying the undercover.

#### Scenario: Voting prompt includes forbidden character analysis
- **WHEN** a player's voting prompt is constructed
- **THEN** the prompt SHALL instruct the player to analyze descriptions for potential forbidden character violations as evidence of being the undercover, and to vote for the most suspicious player

#### Scenario: Voting response format
- **WHEN** a player submits their vote
- **THEN** the response SHALL be in JSON format: {"voteFor": "player name", "reason": "brief reason within 30 characters"}

#### Scenario: Voting response fallback
- **WHEN** the LLM returns a non-JSON or unparseable voting response
- **THEN** the system SHALL assign a random vote among active players and label it as "直觉投票" (intuition vote)

### Requirement: Parallel voting execution
The system SHALL call LLM for all active players' votes in parallel (concurrently) since all players base their vote on the same complete set of descriptions.

#### Scenario: All votes collected simultaneously
- **WHEN** the voting phase is triggered
- **THEN** the system SHALL issue LLM calls for all active players concurrently and collect all results before determining the elimination

### Requirement: Description streaming via SSE
The system SHALL stream each player's description to the frontend via Server-Sent Events as the LLM generates text, achieving a typewriter effect.

#### Scenario: SSE events for description
- **WHEN** a player's description is being generated
- **THEN** the system SHALL emit SSE events: describe_start (with player info), describe_chunk (with text fragments), describe_end (with full text), and round_complete when all players finish

### Requirement: Word library
The system SHALL maintain a library of 50+ word pairs where each pair consists of a civilian word and an undercover word that are semantically similar but different.

#### Scenario: Word pair quality criteria
- **WHEN** word pairs are defined in the library
- **THEN** each pair SHALL satisfy: (1) the two words are semantically related but distinct, (2) the constituent characters of each word are not extremely common (avoiding words containing characters like 子, 的, 大, 小 as primary characters)

#### Scenario: Random word pair selection
- **WHEN** a new game starts
- **THEN** the system SHALL randomly select one word pair from the library
