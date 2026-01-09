Review all staged and modified files before commit. For each changed file:

1. **Redundant comments**: Find and flag any comments that merely describe what the code does (e.g., `// Set the value` above `setValue(x)`). Comments should explain WHY, not WHAT. Suggest removing or rewriting them. Make sure that there are no comments that mirror what says code in any way.

2. **Code quality**: Check if the code could be cleaner, simpler, or more idiomatic. Flag any:
   - Duplicated logic that should be extracted
   - Overly complex conditionals that could be simplified
   - Missing error handling
   - Inconsistencies with existing patterns in the codebase
   - Usage of 'as'. Type assertions should never be used to mask type errors or missing dependencies.** Type assertions with `as` silence the compiler and hide real issues (missing Effect dependencies, incorrect error types, etc.). If the types don't match, fix the underlying problem—don't cast it away. If you can't fix the underlying issue discuss it with me.
   - Make sure logging is done according to logging standarts `docs/logging.md`.

3. **Explanation check**: Have I explained all the important or non-obvious things about this code? Consider:
   - Any tricky edge cases or gotchas
   - Why certain approaches were chosen over alternatives
   - Any limitations or known issues
   - Anything the user might want to know before merging

4. **Final checklist**:
   - [ ] TypeScript compiles without new errors
     When TypeScript check fails, report the errors to the user. Don't silently fix pre-existing errors or hide issues behind type assertions. If an error is unrelated to your changes, say so explicitly: "There's a pre-existing TypeScript error in X that's blocking the build - not from my changes." Let the user decide how to handle it.
   - [ ] Tests pass
   - [ ] No debug code left behind (console.log, debugger, etc.)
   - [ ] Changes match what was requested (not over-engineered)

If any issues are found in steps 1-4, show findings and ask for confirmation before proceeding.

If everything passes (or after issues are resolved), proceed to commit:
5. Stage all relevant changes
6. Create a commit with a properly formatted message following the repo's commit style (check `git log -5 --format=full` for reference)

When making commits, use `git log -5 --format=full` to see actual commit messages (not `--oneline` which only shows titles). Commits have a subject line + body explaining what changed and why. Match the existing style. Remove any auto-generated annotations or irrelevant tool metadata from commit messages. Before committing, review all changed files to ensure no unnecessary comments were added.
