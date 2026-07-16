## 1. Setup and Hooks Creation

- [x] 1.1 Create `src/hooks/useStreamReceiver.ts` to handle SSE typing animations and active player state.
- [x] 1.2 Define the frontend FSM types (`EnginePhase`, `EngineState`, `EngineAction`) in `src/hooks/useGameEngine.ts` (or `src/types/game.ts`).
- [x] 1.3 Implement the `gameReducer` function in `src/hooks/useGameEngine.ts` to handle state transitions based on actions and backend state syncs.
- [x] 1.4 Implement the `useGameEngine` hook to encapsulate API calls, manage the reducer state, and expose actions.

## 2. Component Refactoring

- [x] 2.1 Create `src/components/HeaderBar.tsx` to display game info (round, phase, words).
- [x] 2.2 Create `src/components/UserActionCard.tsx` to handle user input (describe/vote).
- [x] 2.3 Update `src/components/DescriptionPanel.tsx` to accept streaming descriptions and active player status as props instead of managing them internally if necessary, ensuring it works seamlessly with `useStreamReceiver`.
- [x] 2.4 Update `src/components/GameControls.tsx` to accept the new `EnginePhase` and actions from `useGameEngine`.

## 3. Integration in GamePage

- [x] 3.1 Refactor `src/pages/GamePage.tsx` to use the `useGameEngine` and `useStreamReceiver` hooks.
- [x] 3.2 Replace the monolithic rendering logic in `GamePage.tsx` with the newly created sub-components (`HeaderBar`, `UserActionCard`, etc.).
- [x] 3.3 Ensure the SSE callbacks from `useStreamReceiver` are correctly passed to the `gameApi.describeBatch` call within `useGameEngine`.
- [x] 3.4 Verify that `GamePage.tsx` no longer contains complex business logic or raw `fetch`/API calls directly within its body.

## 4. Verification and Testing

- [ ] 4.1 Verify the FSM transitions correctly from `IDLE` through all phases to `GAME_OVER`.
- [ ] 4.2 Test the streaming renderer (`useStreamReceiver`) to ensure typing animations work without causing global re-renders.
- [ ] 4.3 Verify that user inputs (describing and voting) are processed correctly and advance the game state.
- [ ] 4.4 Test edge cases: user elimination, AI viewing mode, and game reset functionality.
