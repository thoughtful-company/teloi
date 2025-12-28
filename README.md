# Teloi

A local-first block-based text editor. Data lives in the browser via SQLite with event sourcing (LiveStore) and text content synced through Yjs CRDT. Built with SolidJS and CodeMirror.

## Setup

Requires Node 20+ and pnpm 10+.

```
pnpm install
pnpm dev:web
```

Open http://localhost:3003.

## Testing

Run `pnpm -F @teloi/web test` for unit tests or `pnpm -F @teloi/web test:browser` for browser tests with Playwright.

## Type Checking

From `apps/web`: `pnpm tsc --noEmit`
