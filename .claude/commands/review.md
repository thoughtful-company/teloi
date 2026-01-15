**Backup first**: Before doing anything else, create a named backup of all current changes tied to the current branch:
```bash
git stash push -m "review-backup:$(git branch --show-current)" --include-untracked
git stash apply
```
This saves a backup (named `review-backup:<branch-name>`) while keeping your changes in place.

---

Review all staged and modified files. For each changed file:

1. **Redundant comments**: Find and flag any comments that merely describe what the code does (e.g., `// Set the value` above `setValue(x)`). Comments should explain WHY, not WHAT. Suggest removing or rewriting them. Make sure that there are no comments that mirror what says code in any way.

2. **Code quality**: Check if the code could be cleaner, simpler, or more idiomatic. Flag any:
   - Duplicated logic that should be extracted
   - Overly complex conditionals that could be simplified
   - Missing error handling
   - Inconsistencies with existing patterns in the codebase
   - Usage of 'as'. Type assertions should never be used to mask type errors or missing dependencies. Type assertions with `as` silence the compiler and hide real issues (missing Effect dependencies, incorrect error types, etc.). If the types don't match, fix the underlying problem—don't cast it away. If you can't fix the underlying issue discuss it with me.
   - Make sure logging is done according to logging standards `docs/logging.md`.

3. **Code simplification**: Run the `code-simplifier:code-simplifier` agent on changed files to refine code for clarity and maintainability. This should be done whenever meaningful new code is added—roughly 10+ lines is a good signal, but use judgment. Skip only for small surgical fixes. If you suspect that existing code nearby (even outside the current changes) could benefit from simplification, run it on those files too.

4. **Explanation check**: Have I explained all the important or non-obvious things about this code? Consider:
   - Any tricky edge cases or gotchas
   - Why certain approaches were chosen over alternatives
   - Any limitations or known issues
   - Anything the user might want to know before merging

5. **Diagrams**: When changes involve non-trivial data flow, component relationships, or architectural modifications, include a diagram to visualize what changed. Only include diagrams when they genuinely aid understanding—don't add them for simple or obvious changes.

6. **Final checklist**:
   - [ ] **Run `pnpm -F @teloi/web typecheck` NOW** — You MUST run typecheck immediately if ANY code changes were made since the last typecheck. No exceptions. Don't assume a previous run is still valid.
     When TypeScript check fails, report the errors to the user. Don't silently fix pre-existing errors or hide issues behind type assertions. If an error is unrelated to your changes, say so explicitly: "There's a pre-existing TypeScript error in X that's blocking the build - not from my changes." Let the user decide how to handle it.
   - [ ] Tests pass
   - [ ] **All new/modified functionality is covered by tests** — If tests are missing, stop and use the `test-architect` agent to write them first.
   - [ ] **No new test files for behavior changes** — When modifying how an existing feature works, update its existing tests. New test files are only for genuinely new features, not for "the same feature now does X instead of Y."
   - [ ] No debug code left behind (console.log, debugger, etc.)
   - [ ] Changes match what was requested (not over-engineered)

If any issues are found, show findings and ask for confirmation before considering the review complete.
