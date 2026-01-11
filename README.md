# Teloi

A tool to build your digital home. Early prototype, actively evolving.

## Why Teloi?

Most note-taking tools give you their structure and expect you to fit your life into it. Folders, tags, databases with fixed fields — they assume you already know how to organize your world.

But life doesn't come with a schema. What matters to you — the projects you track, the relationships you nurture, the habits you build — that's personal. The structure that works for a freelance designer looks nothing like what works for a researcher or a parent managing a household.

**Teloi lets you define your own.** Create schemas that match how *you* think. A "Project" can have whatever properties matter to you. A "Person" can link to whatever contexts they appear in. You're not filling in someone else's template — you're building a model of your own life.

**Source-available.** I started this after getting frustrated with Tana — interesting ideas, but closed source and rough edges I couldn't fix. Teloi is built in the open. Read the code, run it locally, shape where it goes.

## What It Is

A local-first block-based text editor. Data lives in the browser via SQLite with event sourcing (LiveStore) and text content synced through Yjs CRDT. Built with SolidJS and CodeMirror.

## Getting Started

### Prerequisites

You'll need **Node.js 20+** and **pnpm 10+** installed on your machine.

**New to this?** Follow these steps:

1. **Open Terminal**
   - **Mac**: Press `Cmd + Space`, type "Terminal", and hit Enter
   - **Windows**: Press `Win + R`, type "cmd", and hit Enter (or search for "Terminal" in Start menu)
   - **Linux**: Press `Ctrl + Alt + T` or find Terminal in your applications

2. **Install Node.js** (if you don't have it)
   - Download from [nodejs.org](https://nodejs.org/) — get the LTS version
   - Run the installer and follow the prompts
   - Verify by typing in Terminal: `node --version` (should show v20 or higher)

3. **Install pnpm** (package manager)
   - In Terminal, run: `npm install -g pnpm`
   - Or see [pnpm.io/installation](https://pnpm.io/installation) for other methods
   - Verify: `pnpm --version` (should show 10 or higher)

### Running the Project

1. **Clone the repository** (download the code)
   ```bash
   git clone https://github.com/YOUR_USERNAME/teloi.git
   cd teloi
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Start the development server**
   ```bash
   pnpm dev:web
   ```

4. **Open in browser**

   Go to [http://localhost:3003](http://localhost:3003)

To stop the server, press `Ctrl + C` in Terminal.

## Testing

Run `pnpm -F @teloi/web test` for unit tests or `pnpm -F @teloi/web test:browser` for browser tests with Playwright.

## Type Checking

From `apps/web`: `pnpm tsc --noEmit`

## License

This project is licensed under the [PolyForm Shield License 1.0.0](LICENSE). This license allows you to use, modify, and distribute the software for any purpose except providing competing products.

Copyright © 2026 Thoughtful Company
