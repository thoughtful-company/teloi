/**
 * Unit tests for Yjs Y.Text formatting operations.
 *
 * These tests verify the low-level Yjs API for text formatting (bold marks).
 * The actual feature implementation will use these primitives.
 *
 * NOTE: These tests will FAIL until the YjsT service is extended with
 * formatting methods (applyFormat, removeFormat, getMarksAt, getDeltasWithFormats).
 */

import { Id } from "@/schema";
import { YjsT, makeYjsLive } from "@/services/external/Yjs";
import { Effect, Layer, ManagedRuntime } from "effect";
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
    it("applies bold to a selection range", async () => {
      await Effect.gen(function* () {
        const Yjs = yield* YjsT;
        const nodeId = Id.Node.make("test-node-1");
        const ytext = Yjs.getText(nodeId);

        // Setup: "hello world"
        ytext.insert(0, "hello world");

        // Action: Apply bold to "world" (index 6, length 5)
        yield* Yjs.applyFormat(nodeId, 6, 5, { bold: true });

        // Verify: Check the deltas have correct formatting
        const deltas = ytext.toDelta();
        expect(deltas).toEqual([
          { insert: "hello " },
          { insert: "world", attributes: { bold: true } },
        ]);
      }).pipe(runtime.runPromise);
    });

    it("applies bold to entire text when selecting all", async () => {
      await Effect.gen(function* () {
        const Yjs = yield* YjsT;
        const nodeId = Id.Node.make("test-node-2");
        const ytext = Yjs.getText(nodeId);

        ytext.insert(0, "hello");

        yield* Yjs.applyFormat(nodeId, 0, 5, { bold: true });

        const deltas = ytext.toDelta();
        expect(deltas).toEqual([
          { insert: "hello", attributes: { bold: true } },
        ]);
      }).pipe(runtime.runPromise);
    });

    it("extends existing bold formatting when applying to adjacent text", async () => {
      await Effect.gen(function* () {
        const Yjs = yield* YjsT;
        const nodeId = Id.Node.make("test-node-3");
        const ytext = Yjs.getText(nodeId);

        // Setup: "hello world" with "hello" already bold
        ytext.insert(0, "hello world");
        ytext.format(0, 5, { bold: true });

        // Action: Apply bold to " world" (space + world)
        yield* Yjs.applyFormat(nodeId, 5, 6, { bold: true });

        // Verify: Entire text should now be one bold segment
        const deltas = ytext.toDelta();
        expect(deltas).toEqual([
          { insert: "hello world", attributes: { bold: true } },
        ]);
      }).pipe(runtime.runPromise);
    });
  });

  describe("removeFormat", () => {
    it("removes bold from a selection range", async () => {
      await Effect.gen(function* () {
        const Yjs = yield* YjsT;
        const nodeId = Id.Node.make("test-node-4");
        const ytext = Yjs.getText(nodeId);

        // Setup: "hello world" all bold
        ytext.insert(0, "hello world");
        ytext.format(0, 11, { bold: true });

        // Action: Remove bold from "world"
        yield* Yjs.removeFormat(nodeId, 6, 5, { bold: null });

        // Verify
        const deltas = ytext.toDelta();
        expect(deltas).toEqual([
          { insert: "hello ", attributes: { bold: true } },
          { insert: "world" },
        ]);
      }).pipe(runtime.runPromise);
    });

    it("removes bold from middle of bold text, splitting it", async () => {
      await Effect.gen(function* () {
        const Yjs = yield* YjsT;
        const nodeId = Id.Node.make("test-node-5");
        const ytext = Yjs.getText(nodeId);

        // Setup: "abcde" all bold
        ytext.insert(0, "abcde");
        ytext.format(0, 5, { bold: true });

        // Action: Remove bold from "c" (middle character)
        yield* Yjs.removeFormat(nodeId, 2, 1, { bold: null });

        // Verify: Should split into "ab" bold, "c" plain, "de" bold
        const deltas = ytext.toDelta();
        expect(deltas).toEqual([
          { insert: "ab", attributes: { bold: true } },
          { insert: "c" },
          { insert: "de", attributes: { bold: true } },
        ]);
      }).pipe(runtime.runPromise);
    });
  });

  describe("getMarksAt", () => {
    it("returns empty object for plain text", async () => {
      await Effect.gen(function* () {
        const Yjs = yield* YjsT;
        const nodeId = Id.Node.make("test-node-6");
        const ytext = Yjs.getText(nodeId);

        ytext.insert(0, "hello");

        const marks = yield* Yjs.getMarksAt(nodeId, 2);
        expect(marks).toEqual({});
      }).pipe(runtime.runPromise);
    });

    it("returns bold: true when cursor is in bold text", async () => {
      await Effect.gen(function* () {
        const Yjs = yield* YjsT;
        const nodeId = Id.Node.make("test-node-7");
        const ytext = Yjs.getText(nodeId);

        // "hello world" with "world" bold
        ytext.insert(0, "hello world");
        ytext.format(6, 5, { bold: true });

        // Position 8 is inside "world"
        const marks = yield* Yjs.getMarksAt(nodeId, 8);
        expect(marks).toEqual({ bold: true });

        // Position 3 is inside "hello"
        const marksPlain = yield* Yjs.getMarksAt(nodeId, 3);
        expect(marksPlain).toEqual({});
      }).pipe(runtime.runPromise);
    });

    it("returns marks at boundary positions correctly", async () => {
      await Effect.gen(function* () {
        const Yjs = yield* YjsT;
        const nodeId = Id.Node.make("test-node-8");
        const ytext = Yjs.getText(nodeId);

        // "hello world" with "world" bold (starting at index 6)
        ytext.insert(0, "hello world");
        ytext.format(6, 5, { bold: true });

        // Position 6 is the first character of bold "world"
        const marksAtStart = yield* Yjs.getMarksAt(nodeId, 6);
        expect(marksAtStart).toEqual({ bold: true });

        // Position 5 is the space before "world" (not bold)
        const marksBeforeBold = yield* Yjs.getMarksAt(nodeId, 5);
        expect(marksBeforeBold).toEqual({});
      }).pipe(runtime.runPromise);
    });
  });

  describe("getDeltasWithFormats", () => {
    it("returns deltas with formatting preserved for split operation", async () => {
      await Effect.gen(function* () {
        const Yjs = yield* YjsT;
        const nodeId = Id.Node.make("test-node-9");
        const ytext = Yjs.getText(nodeId);

        // Setup: "hello BOLD text" where "BOLD" is bold
        ytext.insert(0, "hello BOLD text");
        ytext.format(6, 4, { bold: true });

        // Get deltas for the range " text" (after cursor at position 10)
        const deltas = yield* Yjs.getDeltasWithFormats(nodeId, 10, 5);

        expect(deltas).toEqual([{ insert: " text" }]);

        // Get deltas for range that includes bold
        const deltasWithBold = yield* Yjs.getDeltasWithFormats(nodeId, 6, 9);
        expect(deltasWithBold).toEqual([
          { insert: "BOLD", attributes: { bold: true } },
          { insert: " text" },
        ]);
      }).pipe(runtime.runPromise);
    });

    it("returns full deltas when getting entire text", async () => {
      await Effect.gen(function* () {
        const Yjs = yield* YjsT;
        const nodeId = Id.Node.make("test-node-10");
        const ytext = Yjs.getText(nodeId);

        // "ab" plain, "cd" bold, "ef" plain
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
    it("inserts deltas with formatting preserved at a position", async () => {
      await Effect.gen(function* () {
        const Yjs = yield* YjsT;
        const nodeId = Id.Node.make("test-node-11");
        const ytext = Yjs.getText(nodeId);

        // Setup: "hello" plain
        ytext.insert(0, "hello");

        // Insert formatted deltas: " BOLD" with bold, " world" plain
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
  });
});

describe("Y.Text Formatting (direct Yjs)", () => {
  // These tests verify our understanding of Yjs formatting API
  // They should pass immediately (testing Yjs behavior, not our code)

  it("format() applies attributes to a range", () => {
    const doc = new Y.Doc();
    const ytext = doc.getText("test");

    ytext.insert(0, "hello world");
    ytext.format(6, 5, { bold: true });

    const deltas = ytext.toDelta();
    expect(deltas).toEqual([
      { insert: "hello " },
      { insert: "world", attributes: { bold: true } },
    ]);
  });

  it("format() with null removes attribute", () => {
    const doc = new Y.Doc();
    const ytext = doc.getText("test");

    ytext.insert(0, "hello");
    ytext.format(0, 5, { bold: true });
    ytext.format(0, 5, { bold: null });

    const deltas = ytext.toDelta();
    expect(deltas).toEqual([{ insert: "hello" }]);
  });

  it("toDelta() returns formatting information", () => {
    const doc = new Y.Doc();
    const ytext = doc.getText("test");

    // Insert all text first, then format
    ytext.insert(0, "plainboldplain2");
    ytext.format(5, 4, { bold: true }); // "bold" (positions 5-9)

    const deltas = ytext.toDelta();
    expect(deltas).toEqual([
      { insert: "plain" },
      { insert: "bold", attributes: { bold: true } },
      { insert: "plain2" },
    ]);
  });

  it("insert() with attributes applies formatting", () => {
    const doc = new Y.Doc();
    const ytext = doc.getText("test");

    ytext.insert(0, "normal ");
    ytext.insert(7, "bold text", { bold: true });

    const deltas = ytext.toDelta();
    expect(deltas).toEqual([
      { insert: "normal " },
      { insert: "bold text", attributes: { bold: true } },
    ]);
  });
});
