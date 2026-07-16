## Why

The current `GamePage.tsx` component is overly bloated (over 500 lines) and acts as a "God Component", handling UI rendering, complex state machine logic, API orchestration, and SSE stream parsing. This violates the Single Responsibility Principle and causes several issues:
1.  **State Management Conflicts**: The frontend state (`phase`) and backend state (`gameState.state`) are not clearly synchronized, leading to implicit logic and potential race conditions.
2.  **Performance Bottlenecks**: High-frequency SSE stream updates (e.g., character-by-character updates in `onDescribeChunk`) trigger re-renders at the top level of `GamePage`, degrading performance.
3.  **Code Duplication and Tight Coupling**: API calls and SSE parsing logic are tightly coupled within the UI component, making it difficult to maintain, test, or reuse.

Refactoring this architecture now is crucial to improve maintainability, ensure robust state transitions, and optimize performance before adding more features.

## What Changes

-   **Extract Game Engine Logic**: Create a `useGameEngine` hook to encapsulate the core game state machine (using `useReducer`), API interactions, and macro-level phase transitions.
-   **Optimize Streaming Rendering**: Implement a `useStreamReceiver` hook to handle high-frequency SSE stream updates (e.g., typing animations) locally, preventing top-level re-renders of the entire `GamePage`.
-   **Refactor `GamePage` UI**: Break down `GamePage.tsx` into smaller, focused UI components (e.g., `HeaderBar`, `UserActionCard`, `DescriptionPanel`) that consume state and actions from `useGameEngine`.
-   **Align Frontend and Backend State**: Design a clear frontend Finite State Machine (FSM) that accurately reflects and syncs with the backend state without overlapping or conflicting.

## Capabilities

### New Capabilities
- `game-engine-fsm`: A robust frontend state machine managing the game lifecycle (IDLE, DESCRIBING, VOTING, RESULT) and syncing with the backend.
- `streaming-renderer`: High-performance local rendering mechanism for SSE text streams to avoid global component re-renders.

### Modified Capabilities
- `game-ui-components`: Refactoring existing `GamePage` UI into smaller, modular components (`HeaderBar`, `UserActionCard`, etc.).

## Impact

-   **Affected Code**: `src/pages/GamePage.tsx`, `src/components/*` (creation of new sub-components and modification of `DescriptionPanel`), and the introduction of new hooks in `src/hooks/`.
-   **Architecture**: Shifts from a monolithic component approach to a separated state/logic (Hooks) and presentation (Components) architecture.
-   **Performance**: Significantly reduces unnecessary re-renders during the describing phase.
