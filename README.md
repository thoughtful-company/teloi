# Teloi

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
