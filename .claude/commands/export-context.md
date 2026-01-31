Generate a self-contained prompt for starting a fresh chat about a problem.

## Why this exists

Conversations accumulate cruft. By the time we're deep into debugging, the chat is full of solved problems, dead-end theories, and tangents that no longer matter. Starting fresh means a cleaner mental model — but you don't want to lose the understanding you've built.

This command extracts that understanding into a prompt for a new chat. It's atomic problem-solving: one problem, one session, clean boundaries. Like how commits are atomic units of work.

The output isn't a spec to execute — it's a handoff from one Claude to another. The new Claude should treat it as context and hints, not instructions. They should read the mentioned files, form their own understanding, and verify with the human before diving in. If something seems off or unclear, ask — don't assume the previous Claude got it right.

The generated prompt also serves as a verification checkpoint. If you summarize the problem wrong, the human catches it before wasting a new session.

---

## Arguments

`$ARGUMENTS`

Check for `--skip` or `-s` flag (skips interactive Q&A). The remaining text is the topic to export. No topic? Scope to the most recent problem we were working on.

---

## Modes

**Interactive (default):** Before generating, help compose the prompt through Q&A:
1. Think out loud about what the prompt should contain — what's the core problem, what context matters, what's noise
2. Identify ambiguities in your own understanding
3. Ask clarifying questions to resolve them
4. Iterate until the human confirms you've got it
5. Then generate

**Skip (`-s` / `--skip`):** Jump straight to generating. But if you're genuinely confused about scope — unclear topic, multiple possible problems — still ask. The flag means "skip the full dance," not "guess blindly."

---

## What to include

- **The situation in prose**: What we were doing, what's broken or confusing, what we've figured out. Write like you're handing off to a colleague, not filing a ticket.
- **Relevant files**: Woven into prose naturally, or as a short list if there are several. Say *what* to look at in each file and *why* it matters.
- **Approaches discussed**: Only if the human explicitly mentioned them. Caveat as "theory worth revisiting fresh," not "the solution."

## What to exclude

- Direct solutions — let the new Claude figure it out
- Dead-end tangents — unless useful as "don't waste time on X" warnings
- Solved problems that aren't relevant to the export scope
- Overly formal structure — no "## Expected Behavior" bureaucracy unless it genuinely helps

---

## Output format

```
[Context from a previous Claude session]

<Prose explaining the problem — what we were working on, what's weird, relevant files woven in. Conversational, not clinical.>

---

[Human notes]

<Empty space for the human to add context, corrections, or steering before pasting.>

---

The above is a handoff, not a spec. Read the mentioned files, form your own understanding, and check with the human if anything seems off or unclear before diving in.
```

---

## After generating

Save the generated prompt to `handoff.md` in the project root.

Provide a brief summary so the human can quickly verify without reading everything:

**TL;DR:** One sentence — what is this prompt about?

**Caveats:** Where is your understanding uncertain? What assumptions did you make? What might you have gotten wrong?
