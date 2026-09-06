---
name: effect
description: How Effect-TS is used in this repo. Load when writing or changing services, layers, typed errors, Effect schemas, logging, or tests that build an Effect runtime.
---

# Effect in Teloi

Effect is used for all program structure, not only for async. Reach for its utilities before writing your own.

## Services

A service is a Context.Tag with an explicit interface. Services replace modules as the unit of abstraction. In apps/web they sit in src/services/ in three tiers, external/ for integrations such as the LiveStore wrapper StoreT, domain/ for business logic such as NodeT, and ui/ for UI state such as FrameT. A new package should keep the same split.

## Layers

Layers built with Layer.effect compose services and inject dependencies. Compose with Layer.provideMerge. A runtime is a ManagedRuntime over the composed layer. apps/web has one, BrowserLayer in src/runtime.ts, composed KhoraLive, FrameLive, WorldLive, NodeLive, StoreLive.

## Errors

Errors are Data.TaggedError classes, so failures form a discriminated union the type checker can exhaust.

## Traceable functions

Write functions with Effect.fn so they carry a name in traces.

    // traceable
    const myFunction = Effect.fn("myFunction")(function* (arg: string) {
      // ...
    });

    // not traceable, avoid
    const myFunction = (arg: string) => Effect.gen(function* () {
      // ...
    });

## Logging

Wide events. One structured log per unit of work, fields added with Effect.annotateLogs as the work progresses. The full standard is in docs/logging.md, read it before adding a log line.

## Schemas

Domain models use Effect Schema. In apps/web, src/schema/ holds Model.DocumentName for document types, an Id module with branded id types, and an Entity module with shared structures. Ids are branded so a khora id cannot be passed where a frame id is expected.

## Tests

Tests build a real runtime, never a mock. For Node tests use @livestore/adapter-node with in-memory storage and createStorePromise, compose layers with Layer.provideMerge, run through ManagedRuntime, and clean up in beforeEach. For assertions that wait on Effect work, prefer Effect combinators over promise wrappers.
