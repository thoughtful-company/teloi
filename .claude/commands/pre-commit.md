Review all staged and modified files before commit. For each changed file:

1. **Redundant comments**: Find and flag any comments that merely describe what the code does (e.g., `// Set the value` above `setValue(x)`). Comments should explain WHY, not WHAT. Suggest removing or rewriting them.

2. **Code quality**: Check if the code could be cleaner, simpler, or more idiomatic. Flag any:
   - Duplicated logic that should be extracted
   - Overly complex conditionals that could be simplified
   - Missing error handling
   - Inconsistencies with existing patterns in the codebase

3. **Explanation check**: Have I explained all the important or non-obvious things about this code? Consider:
   - Any tricky edge cases or gotchas
   - Why certain approaches were chosen over alternatives
   - Any limitations or known issues
   - Anything the user might want to know before merging

4. **Final checklist**:
   - [ ] TypeScript compiles without new errors
   - [ ] Tests pass
   - [ ] No debug code left behind (console.log, debugger, etc.)
   - [ ] Changes match what was requested (not over-engineered)

Show me a summary of findings and recommendations.
