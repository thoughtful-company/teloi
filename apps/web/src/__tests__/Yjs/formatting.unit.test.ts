/**
 * Unit tests for Yjs Y.Text formatting operations.
 *
 * Tests YjsT service methods and raw Yjs API behavior.
 * Uses bold as representative since all marks use identical code paths.
 */

import { Id } from "@/schema";
import { YjsT, makeYjsLive } from "@/services/external/Yjs";
import { Effect, ManagedRuntime } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";

describe("YjsT Formatting Operations", () => {
  let runtime: ManagedRuntime.ManagedRuntime<YjsT, never>;

  beforeEach(async () => {
    const layer = makeYjsLive({ roomName: "test-formatting", persist: false });
    runtime = ManagedRuntime.make(layer);
  });

  afterEach(async () => {
    await runtime.dispose();
  });

  describe("applyFormat", () => {
    it("applies formatting to a range", async () => {
      await Effect.gen(function* () {
        const Yjs = yield* YjsT;
        const nodeId = Id.Node.make("test-1");
        const ytext = Yjs.getText(nodeId);

        ytext.insert(0, "hello world");
        yield* Yjs.applyFormat(nodeId, 6, 5, { bold: true });

        const deltas = ytext.toDelta();
        expect(deltas).toEqual([
          { insert: "hello " },
          { insert: "world", attributes: { bold: true } },
        ]);
      }).pipe(runtime.runPromise);
    });

    it("extends existing formatting when applying to adjacent text", async () => {
      await Effect.gen(function* () {
        const Yjs = yield* YjsT;
        const nodeId = Id.Node.make("test-2");
        const ytext = Yjs.getText(nodeId);

        ytext.insert(0, "hello world");
        ytext.format(0, 5, { bold: true });
        yield* Yjs.applyFormat(nodeId, 5, 6, { bold: true });

        const deltas = ytext.toDelta();
        expect(deltas).toEqual([
          { insert: "hello world", attributes: { bold: true } },
        ]);
      }).pipe(runtime.runPromise);
    });
  });

  describe("removeFormat", () => {
    it("removes formatting from a range", async () => {
      await Effect.gen(function* () {
        const Yjs = yield* YjsT;
        const nodeId = Id.Node.make("test-3");
        const ytext = Yjs.getText(nodeId);

        ytext.insert(0, "hello world");
        ytext.format(0, 11, { bold: true });
        yield* Yjs.removeFormat(nodeId, 6, 5, { bold: null });

        const deltas = ytext.toDelta();
        expect(deltas).toEqual([
          { insert: "hello ", attributes: { bold: true } },
          { insert: "world" },
        ]);
      }).pipe(runtime.runPromise);
    });
  });

  describe("getMarksAt", () => {
    it("returns empty object for plain text", async () => {
      await Effect.gen(function* () {
        const Yjs = yield* YjsT;
        const nodeId = Id.Node.make("test-4");
        const ytext = Yjs.getText(nodeId);

        ytext.insert(0, "hello");
        const marks = yield* Yjs.getMarksAt(nodeId, 2);
        expect(marks).toEqual({});
      }).pipe(runtime.runPromise);
    });

    it("returns all active marks at position", async () => {
      await Effect.gen(function* () {
        const Yjs = yield* YjsT;
        const nodeId = Id.Node.make("test-5");
        const ytext = Yjs.getText(nodeId);

        ytext.insert(0, "hello world");
        ytext.format(6, 5, { bold: true, italic: true, code: true });

        const marks = yield* Yjs.getMarksAt(nodeId, 8);
        expect(marks).toEqual({ bold: true, italic: true, code: true });

        const plainMarks = yield* Yjs.getMarksAt(nodeId, 3);
        expect(plainMarks).toEqual({});
      }).pipe(runtime.runPromise);
    });
  });

  describe("getDeltasWithFormats", () => {
    it("extracts deltas with formatting for a range", async () => {
      await Effect.gen(function* () {
        const Yjs = yield* YjsT;
        const nodeId = Id.Node.make("test-6");
        const ytext = Yjs.getText(nodeId);

        ytext.insert(0, "abcdef");
        ytext.format(2, 2, { bold: true });

        const deltas = yield* Yjs.getDeltasWithFormats(nodeId, 0, 6);
        expect(deltas).toEqual([
          { insert: "ab" },
          { insert: "cd", attributes: { bold: true } },
          { insert: "ef" },
        ]);
      }).pipe(runtime.runPromise);
    });
  });

  describe("insertWithFormats", () => {
    it("inserts deltas preserving formatting", async () => {
      await Effect.gen(function* () {
        const Yjs = yield* YjsT;
        const nodeId = Id.Node.make("test-7");
        const ytext = Yjs.getText(nodeId);

        ytext.insert(0, "hello");
        yield* Yjs.insertWithFormats(nodeId, 5, [
          { insert: " BOLD", attributes: { bold: true } },
          { insert: " world" },
        ]);

        const deltas = ytext.toDelta();
        expect(deltas).toEqual([
          { insert: "hello" },
          { insert: " BOLD", attributes: { bold: true } },
          { insert: " world" },
        ]);
      }).pipe(runtime.runPromise);
    });

    it("clears inherited formatting when inserting plain text", async () => {
      await Effect.gen(function* () {
        const Yjs = yield* YjsT;
        const nodeId = Id.Node.make("test-8");
        const ytext = Yjs.getText(nodeId);

        ytext.insert(0, "BOLD");
        ytext.format(0, 4, { bold: true });

        // Insert plain text after bold - should NOT inherit bold
        yield* Yjs.insertWithFormats(nodeId, 4, [{ insert: " plain" }]);

        const deltas = ytext.toDelta();
        expect(deltas).toEqual([
          { insert: "BOLD", attributes: { bold: true } },
          { insert: " plain" },
        ]);
      }).pipe(runtime.runPromise);
    });
  });
});

describe("Y.Text Raw API", () => {
  // Verify our understanding of Yjs behavior

  it("format() applies and removes attributes", () => {
    const doc = new Y.Doc();
    const ytext = doc.getText("test");

    ytext.insert(0, "hello");
    ytext.format(0, 5, { bold: true });
    expect(ytext.toDelta()).toEqual([
      { insert: "hello", attributes: { bold: true } },
    ]);

    ytext.format(0, 5, { bold: null });
    expect(ytext.toDelta()).toEqual([{ insert: "hello" }]);
  });

  it("supports multiple concurrent attributes", () => {
    const doc = new Y.Doc();
    const ytext = doc.getText("test");

    ytext.insert(0, "text");
    ytext.format(0, 4, { bold: true, italic: true, code: true });

    expect(ytext.toDelta()).toEqual([
      { insert: "text", attributes: { bold: true, italic: true, code: true } },
    ]);
  });

  it("insert() with attributes applies formatting", () => {
    const doc = new Y.Doc();
    const ytext = doc.getText("test");

    ytext.insert(0, "plain ");
    ytext.insert(6, "bold", { bold: true });

    expect(ytext.toDelta()).toEqual([
      { insert: "plain " },
      { insert: "bold", attributes: { bold: true } },
    ]);
  });
});
