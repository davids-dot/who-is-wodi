## ADDED Requirements

### Requirement: LLM stream total timeout
The system SHALL enforce a total timeout on all streaming LLM calls. When the total elapsed time from the start of a streaming call exceeds the configured threshold, the system SHALL abort the underlying HTTP connection and throw an `LLM_TIMEOUT` error.

#### Scenario: Stream exceeds total timeout
- **WHEN** a streaming LLM call has been in progress for longer than `LLM_TIMEOUT_MS` (default 30000ms)
- **THEN** the system SHALL abort the HTTP connection via `AbortController.abort()`, stop iterating the stream, and throw an error with code `LLM_TIMEOUT`

#### Scenario: Stream completes within total timeout
- **WHEN** a streaming LLM call completes (receives `finish_reason`) within `LLM_TIMEOUT_MS`
- **THEN** the system SHALL clear the total timeout timer and yield all received chunks normally

### Requirement: LLM stream idle timeout
The system SHALL enforce an idle timeout on streaming LLM calls. When no chunk has been received for longer than the configured idle threshold, the system SHALL abort the connection and throw an `LLM_TIMEOUT` error.

#### Scenario: No chunk received within idle window
- **WHEN** the time since the last received chunk exceeds `LLM_IDLE_TIMEOUT_MS` (default 15000ms) during a streaming call
- **THEN** the system SHALL abort the HTTP connection and throw an error with code `LLM_TIMEOUT`

#### Scenario: Idle timer resets on each chunk
- **WHEN** a new chunk is received during a streaming call
- **THEN** the idle timeout timer SHALL be reset to start counting from zero again

### Requirement: Configurable timeout thresholds
The system SHALL allow timeout thresholds to be configured via environment variables with sensible defaults.

#### Scenario: Default timeout values
- **WHEN** neither `LLM_TIMEOUT_MS` nor `LLM_IDLE_TIMEOUT_MS` environment variables are set
- **THEN** the system SHALL use 30000ms as the total timeout and 15000ms as the idle timeout

#### Scenario: Custom timeout values
- **WHEN** `LLM_TIMEOUT_MS=60000` and `LLM_IDLE_TIMEOUT_MS=20000` are set in the environment
- **THEN** the system SHALL use 60000ms as the total timeout and 20000ms as the idle timeout

### Requirement: Timeout error identification
The system SHALL throw errors with a distinguishable code `LLM_TIMEOUT` when a timeout occurs, so that callers can differentiate timeout errors from other LLM failures.

#### Scenario: Timeout error has identifiable code
- **WHEN** a streaming LLM call times out (either total or idle)
- **THEN** the thrown error SHALL have a property `code` set to the string `'LLM_TIMEOUT'`

#### Scenario: Non-timeout errors do not have LLM_TIMEOUT code
- **WHEN** an LLM call fails for reasons other than timeout (e.g., 401 auth error, 429 rate limit)
- **THEN** the thrown error SHALL NOT have `code` set to `'LLM_TIMEOUT'`
