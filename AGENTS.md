Hi, I need your help building an application.

I want you to try to understand deeply what and why I am building, its vision, so you can make better decisions on the micro level autonomously. Another reason is that I want you to become a creator in this project and help to improve its quality in general.

Before I go on, I'd rather ask than guess: what do you specifically need to know from me so I don't end up writing this twice? Ask me, and I'll answer below.

Hey, you!

Yes, I have some questions. Right now I only know that you're building an application and that you want me to understand it well enough to make small decisions on my own. That's not much to go on, so let me ask, and I'll number them so you can answer one by one.

Q1: What is the application? If I sat down to use it, what would I do with it, and what would I get back?

Q2: Why are you building it? Was there a problem you ran into that nothing solved well, or is this something that just doesn't exist yet?

Q3: Who is it for? Only you, other developers, or people who have never opened a terminal?

Q4: Which programming language and tools are we using, and why those?

Q5: When I have to choose between finishing quickly and doing it properly, which one do you want me to pick?

Q6: What am I allowed to decide on my own, and what should I always ask you about first? For example: names, how the code is organised, which libraries to add.

Q7: How often do you want to hear from me while I work? Should I check in as I go, or build something and then show you?

Q8: You said you want me to be a creator here. Does that mean I can disagree with your ideas, suggest things you didn't ask for, and change code I think is wrong? Those are three different things, so tell me which ones you mean.

---

Teloi lets people model their domains. In Teloi you create workspaces, and in each workspace you model a different system or area of life. Usually a user has one meta-workspace from which she can reach all her other workspaces, and those can be scoped per project and shared with several people.

A workspace can be accessed by a person or by an agent. Access is audited, so every action is stored and you can see what data was exposed, and so on. There could also be a system on top of that to watch for strange usage, say an agent behaving suspiciously, but that's an additional idea.

You interact with it either through an agent, by asking it to go and do something, or through a UI, in Electron or on the web. Under the hood every operation is stored in an event log and everything can be replayed, and that part is handled by LiveStore.

It's for me, but I hope it can become useful for others. I just need to figure out how to use it myself first.

On Q1a. A model consists of signs that refer to objects. For now that's the whole model. Each object has a note, which is the sign, and the note has content, markdown text for the moment, with the ability to import other pages. In future this might change completely into something more graph-based.

The signs stand for different types of objects, Individual Object, Set, Tuple, Tuple Set. I might be mistaken in the naming.

A single model is a description of our reality, or some reality, and it can contain different things, domains and so on.

The modeler does not enforce 4D extensionalism, but it may get an additional mode or plugin for that.

On Q1b. Each object note should carry two descriptions, one about itself as an object, and a second about the note itself as a document, so it describes its current version and also refers to the collection of all versions of that document.

Going deeper, the inside of a note is composed of blocks. A sequence of blocks is attached to a single sign note, labelled "note content", or "sign content", or simply "content". Each block can carry metadata about itself without referring to any objects. So if a block is a paragraph, it is a description, not a sign, because a paragraph does not represent anything. And the sign's title only names the object, it does not necessarily describe it, it is just a token.

On Q1c. Yes, the command-line tool is what an agent uses to model something, either autonomously or together with a person.

On Q2. One example is modelling a virtual world, to simulate environments with characters that may be played by agents.

More precisely, nothing existing lets you model a world following the constructivist ontology of BORO.

On Q4. UI probably SolidJS. There is a sync backend, yes, maybe LiveStore on the server. Maybe teloi-cli should actually be connecting to the server, or maybe it can run locally and link to the server. I'm thinking the server is what manages all the running, so teloi-cli can't be the runtime. The CLI simply sends commands to the runtime, and the runtime executes them.

On Q4a. The runtime does not exist yet. We may move to ~/Projects/teloi and write both the server and the CLI there, and there are already some useful parts in it.

On Q4b. Yes, this letter replaces the AGENTS.md there. Don't read that repo yet.

On Q5. The trade-off isn't fast versus right, it's quality versus efficiency, where efficiency means spending fewer tokens on solving the problem. We choose quality in every case, unless I say let's do something quicker. We care deeply about maintainability and we build the system to avoid complexity.

On Q6. You can make all micro-decisions alone, everything that is easy to reverse. If something is architectural you may still decide it on your own, but then communicate it clearly, and make it possible to go back and fix it. If you're not sure about a decision because there's a trade-off that touches on a value you don't know my attitude towards, ask me.

On Q7. The default is that you do the work autonomously. Keep a journal of dissatisfactions, stored locally, and write there every time something is not optimal but does not make sense to fix straight away. Later you'll have an agent that you communicate with me through, and it will formulate all your messages to me clearly.

Actually, I was thinking about making Teloi itself a harness that allows you to program it. But that needs a strong foundation first, and for the harness itself I can reuse the t3 code codebase and take whatever I need from it.

So I want to build the Teloi server part first. Maybe we should find a name for it, a Greek one.

The server is called Entelecheia, short name entel. It means "having the end within", the runtime that realizes the teloi.

On Q8. Yes, you can safely disagree with my ideas, and you can propose things that improve the quality of our software. I'm open to it, it's just that I really want it to be useful and not just distractions.

On the working rules from the old file. They carry over, with one change. We work through Linear, in the Thoughtful Company workspace, so all issues go there.

On the code conventions. Those should move into an "effect" skill that teaches how to use Effect, because not every task is about writing Effect code.

On the stack. The stack choice from the web app is fine for the server too.

On Linear. The Linear MCP will be connected specifically to the ~/Projects/teloi folder.

On where sub-project instructions go. Rules that anyone editing a sub-project must obey go in that sub-project's own CLAUDE.md, for example apps/web/CLAUDE.md, which loads only when a file under it is read. Recipes and gotchas go in a skill with a paths list, so they load when a matching file is touched. Descriptions of how something is built are documentation and go in that sub-project's docs folder, referenced from its CLAUDE.md with one line each.

On the old rules "only explain, never fix unless told" and "ask as many follow-ups as needed". They are not in force. They still need a review, once I have enough in front of me to judge them.

On naming. Major things are named with Greek words, one word per thing. Teloi, Entelecheia, khora.

On the journal of dissatisfactions. It lives outside every repo, and my personal CLAUDE.md points to it.

---

That closes the questions. What follows is what I carried over from the old AGENTS.md of this repo, rewritten. The old file was mostly about the web app's editor, and that part now lives in apps/web/CLAUDE.md, in the docs folder, and in two skills.

## Working rules

Work is tracked in Linear, in the Thoughtful Company workspace. Issues go there, not to GitHub. The Linear MCP is connected in this folder only.

Branch before every feature. Never commit to main. Never mix unrelated work into one branch.

Comments say why, not what. The code already shows what it does. Write a comment for reasoning that isn't obvious, for a workaround around an external limit, or for an invariant the code can't express.

Look before you theorize. Read the relevant files before saying how something works.

Tests come before implementation. Read docs/testing.md before writing, moving or debugging any test. Use the test-architect agent for new tests, and work directly when debugging a failing one.

Before saying you're done, say what you implemented that tests don't cover.

No mocks, stubs or fakes in tests. Use real services with fixtures. If something can't be tested without a mock, the design is wrong, fix the design.

No boolean flags that gate events or callbacks, like if (ready) dispatch(...). If the architecture needs one, the approach is wrong. Find the shape where the correct state exists from the start.

Logging follows docs/logging.md. Wide events, through Effect.annotateLogs.

Exported API goes at the top of a file. Internal helpers go below this separator, 80 characters wide including the comment marker:

    // ================================ Internal ==================================

Effect code follows the effect skill. Load it when the task touches services, layers, errors or Effect tests.

Keep this file current. Add what the code can't tell you, and nothing the code already says. Rules for the docs folder are in .claude/rules/writing-docs.md.

## Naming

Major things get a Greek word, one word per thing. Teloi is the product. Entelecheia, short entel, is the server that runs workspaces. Khora is a node in the web app.

## Stack

TypeScript throughout. Effect for services, layers, errors and schemas. LiveStore for structure and the event log. Automerge for text content. SolidJS with Tailwind v4 for the web app. Vitest, with Playwright for browser tests. The same stack applies to entel.

## Layout

A pnpm monorepo.

- apps/web, the SolidJS web app, package @teloi/web. It has its own CLAUDE.md.
- apps/electron, the desktop shell around the web app.
- packages/typescript-config, shared TypeScript config.
- entel and the CLI do not exist yet. They are the next thing to build.

Lint the whole repo with pnpm eslint . from the root.
