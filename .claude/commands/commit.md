**Pre-flight check**: Before proceeding, examine the conversation history. If there were ANY code changes (Edit, Write, file modifications) since the last `/review` command was run, run `/review` yourself first. Do not proceed with the commit until the review has completed and any issues are resolved.

After review is done (or if review was already fresh), proceed:

1. Stage all relevant changes
2. Create a commit with a properly formatted message following the repo's commit style (check `git log -5 --format=full` for reference). If the commit closes a GitHub issue, include `Closes #<issue-number>` in the commit message body.

When making commits, use `git log -5 --format=full` to see actual commit messages (not `--oneline` which only shows titles). Commits have a subject line + body explaining what changed and why. Match the existing style. Remove any auto-generated annotations or irrelevant tool metadata from commit messages. Before committing, review all changed files to ensure no unnecessary comments were added.

**Commit message style**: Write for humans. Start with a readable paragraph explaining the change, not a bullet list. Use lists only when enumerating specific items (files, features, flags), and keep them compact. The message should flow naturally when read aloud.

---

**Cleanup**: After a successful commit, run `git stash list` and look for a stash named `review-backup:<current-branch>`. If it exists, drop it.
