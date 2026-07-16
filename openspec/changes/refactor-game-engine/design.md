## Context

The current `GamePage.tsx` component is overly complex, combining UI rendering, game state management, and SSE stream parsing. This tight coupling violates the Single Responsibility Principle, making the code hard to maintain and prone to performance issues, particularly during the high-frequency SSE describing phase. We need to decouple the game logic from the UI presentation.

## Goals / Non-Goals

**Goals:**
- Decouple the game engine state machine from the UI component.
- Implement a clear frontend Finite State Machine (FSM) that aligns with the backend state.
- Optimize the rendering of SSE streams to prevent full-page re-renders.
- Create modular UI components for `GamePage`.

**Non-Goals:**
- Changing the backend `engine.js` or `routes/game.js` logic.
- Adding new game features or modes.
- Refactoring `gameApi.ts` to use `request.ts` (this will be handled in a separate change if needed).

## Decisions

### 1. State Management: `useGameEngine` Hook with `useReducer`
We will extract the core game logic into a custom hook `useGameEngine`. Instead of multiple `useState` calls, we will use `useReducer` to implement a strict Finite State Machine (FSM) for the game phases.
-   **Why `useReducer` over `useState`?** The game has complex state transitions (e.g., IDLE -> DESCRIBING_AI_1 -> WAITING_USER_DESC -> DESCRIBING_AI_2) that depend on previous states and specific actions. `useReducer` provides a predictable and centralized way to manage these transitions.
-   **Alternatives Considered:** Continuing with `useState` or using a dedicated state library like Redux or Zustand. `useReducer` is sufficient for this scope without introducing external dependencies.

### 2. High-Frequency Rendering: `useStreamReceiver` Hook
We will create a separate hook, `useStreamReceiver`, to handle the incoming SSE data (the typing effect).
-   **Why a separate hook?** The SSE stream updates frequently (character by character). If this state is managed in the main `GamePage` or `useGameEngine`, it will trigger unnecessary re-renders of the entire page. By isolating this into `useStreamReceiver`, we can limit re-renders to only the components that need to display the stream (e.g., `DescriptionPanel`).
-   **Implementation:** It will expose callbacks (`onDescribeStart`, `onDescribeChunk`, etc.) that `useGameEngine` can pass to `gameApi.describeBatch`.

### 3. Frontend FSM Phases
The frontend FSM will have more granular phases than the backend to handle the UI states correctly:
-   `IDLE`
-   `DEALING` (optional animation phase)
-   `DESCRIBING_AI_1` (first batch of AI)
-   `WAITING_USER_DESC` (waiting for user input)
-   `DESCRIBING_AI_2` (second batch of AI)
-   `VOTING_AI` (waiting for AI votes)
-   `WAITING_USER_VOTE` (waiting for user vote)
-   `SHOW_RESULT` (showing round result)
-   `GAME_OVER`

### 4. Component Splitting
`GamePage.tsx` will be refactored into:
-   `HeaderBar.tsx`: Displays round, phase, and word info.
-   `UserActionCard.tsx`: Handles user input for describing and voting based on the current phase.
-   `GameControls.tsx` (existing, but updated to use new actions).
-   `RoundTable.tsx` (existing, but updated props).
-   `DescriptionPanel.tsx` (existing, updated to use `useStreamReceiver` data).

## Risks / Trade-offs

-   **Risk**: Synchronization issues between the frontend FSM and backend state, especially on page reload or disconnects.
    -   **Mitigation**: The `useGameEngine` will initialize by fetching the current `GamePublicState` from the backend and deriving the correct initial frontend phase based on that state and the user's status.
-   **Trade-off**: Introducing `useReducer` adds some boilerplate (actions, reducer function) compared to simple `useState` calls. However, the clarity and predictability gained in managing complex state transitions outweigh the cost of the boilerplate.