**1. Adopt "Wide Events"**
Consolidate individual steps ("entering", "setting value", "returning") into a single, comprehensive "Operation Completed" log. Optimize for querying outcomes, not tracing execution flow.

**2. Enforce Structured Context**
Use `Effect.annotateLogs` to attach metadata. Logs must contain sufficient context (IDs, state snapshots) to reproduce issues without needing to grep for surrounding lines.

**3. Implementation Pattern**
Adhere to the following pattern for all service-level operations:

```typescript
// REJECTED: Linear, text-based tracing
yield* Effect.logDebug("Setting selection");
yield* Effect.logDebug(`bufferId is ${bufferId}`);

// REQUIRED: Single event with attached context
yield* Effect.logDebug("[Buffer.setSelection] Selection updated").pipe(
  Effect.annotateLogs({
    bufferId,
    "selection.anchor": selection.anchor.nodeId,
    "selection.anchorOffset": selection.anchorOffset,
    "seleciton.focus": selection.focus.nodeId,
    "selection.focusOffest": selection.focusOffset,
    goalX: selection.goalX,
  }),
);
```

**4. Data Requirements**
Ensure every log includes:
*   **Identifiers:** Request IDs, User IDs, Entity IDs (e.g., `bufferId`).
*   **State:** The relevant data snapshot at the moment of the event.
*   **Outcome:** The final result of the operation.

**5. Standardized Levels**
*   **`logDebug`**: **State Transitions.** Use for meaningful changes (selection updates, navigation, focus changes).
*   **`logTrace`**: **High Frequency.** Use for noisy events/loops; must be disabled by default.
*   **`logError`**: **Failures.** Must include full context for reproduction.

**6. Architectural Constraints**
*   **Services Only:** Execute logging exclusively within Services where `Effect` context is available.
*   **UI Logging:** Use console.log/warning/error if you need to debug temporarilyt.
