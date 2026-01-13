import "@/index.css";
import { COLOR_PALETTE, Id, System } from "@/schema";
import { BootstrapT } from "@/services/domain/Bootstrap";
import { TupleT } from "@/services/domain/Tuple";
import { YjsT } from "@/services/external/Yjs";
import { TypeColorT } from "@/services/ui/TypeColor";
import { DEFAULT_COLORS } from "@/services/ui/TypeColor/types";
import { TypePickerT } from "@/services/ui/TypePicker";
import { Effect, Stream } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Given, setupClientTest, type BrowserRuntime } from "./bdd";

describe("TypeColorT Service", () => {
  let runtime: BrowserRuntime;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await setupClientTest();
    runtime = setup.runtime;
    cleanup = setup.cleanup;

    // Bootstrap system nodes (including DEFAULT_TYPE_COLOR)
    await Effect.gen(function* () {
      const Bootstrap = yield* BootstrapT;
      yield* Bootstrap.ensureSystemNodes();
    }).pipe(runtime.runPromise);
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("getColors", () => {
    it("returns default colors when no TYPE_HAS_COLOR tuple exists", async () => {
      await Effect.gen(function* () {
        const TypeColor = yield* TypeColorT;

        // Create a type without any color configuration (raw node, no auto-assign)
        const { typeId } = yield* Given.A_TYPE_WITHOUT_COLOR();

        // Get colors for this type
        const colors = yield* TypeColor.getColors(typeId);

        // Should return default colors (green hue 145)
        expect(colors.bg).toBe(DEFAULT_COLORS.bg);
        expect(colors.fg).toBe(DEFAULT_COLORS.fg);
      }).pipe(runtime.runPromise);
    });

    it("returns configured colors when type has full color node with bg + fg tuples", async () => {
      await Effect.gen(function* () {
        const TypeColor = yield* TypeColorT;
        const { typeId, expectedBg, expectedFg } =
          yield* Given.A_TYPE_WITH_FULL_COLOR({
            bg: "oklch(0.85 0.08 200)",
            fg: "oklch(0.25 0.15 200)",
          });

        const colors = yield* TypeColor.getColors(typeId);

        expect(colors.bg).toBe(expectedBg);
        expect(colors.fg).toBe(expectedFg);
      }).pipe(runtime.runPromise);
    });

    it("derives foreground from background when type has direct value node", async () => {
      await Effect.gen(function* () {
        const TypeColor = yield* TypeColorT;
        const { typeId, expectedBg } = yield* Given.A_TYPE_WITH_DIRECT_COLOR(
          "oklch(0.9 0.05 250)",
        );

        const colors = yield* TypeColor.getColors(typeId);

        // Background should match the direct value
        expect(colors.bg).toBe(expectedBg);
        // Foreground should be derived: oklch(0.35 0.12 <hue>)
        expect(colors.fg).toBe("oklch(0.35 0.12 250)");
      }).pipe(runtime.runPromise);
    });

    it("returns default colors for invalid oklch format", async () => {
      await Effect.gen(function* () {
        const TypeColor = yield* TypeColorT;
        // Create a type with invalid color format (missing closing paren)
        const { typeId } = yield* Given.A_TYPE_WITH_DIRECT_COLOR(
          "oklch(0.9 0.05 250",
        );

        const colors = yield* TypeColor.getColors(typeId);

        // Background is the invalid string (as-is)
        expect(colors.bg).toBe("oklch(0.9 0.05 250");
        // Foreground should fallback to default since regex didn't match
        expect(colors.fg).toBe(DEFAULT_COLORS.fg);
      }).pipe(runtime.runPromise);
    });

    it("returns default colors for empty text content", async () => {
      await Effect.gen(function* () {
        const TypeColor = yield* TypeColorT;
        // Create a type with empty color value
        const { typeId } = yield* Given.A_TYPE_WITH_DIRECT_COLOR("");

        const colors = yield* TypeColor.getColors(typeId);

        // Should return default colors
        expect(colors.bg).toBe(DEFAULT_COLORS.bg);
        expect(colors.fg).toBe(DEFAULT_COLORS.fg);
      }).pipe(runtime.runPromise);
    });
  });

  describe("subscribeColors", () => {
    it("emits new colors when TYPE_HAS_COLOR tuple is added", async () => {
      await Effect.gen(function* () {
        const TypeColor = yield* TypeColorT;
        const Tuple = yield* TupleT;
        const Yjs = yield* YjsT;

        // Create a type without any color configuration (raw node, no auto-assign)
        const { typeId } = yield* Given.A_TYPE_WITHOUT_COLOR();

        // Subscribe to color changes
        const colorStream = yield* TypeColor.subscribeColors(typeId);

        // Collect emissions
        const emissions: Array<{ bg: string; fg: string }> = [];

        // Take first emission (should be default)
        const firstEmission = yield* Stream.runHead(colorStream);
        if (firstEmission._tag === "Some") {
          emissions.push(firstEmission.value);
        }

        // First emission should be default colors
        expect(emissions[0]?.bg).toBe(DEFAULT_COLORS.bg);
        expect(emissions[0]?.fg).toBe(DEFAULT_COLORS.fg);

        // Now add a TYPE_HAS_COLOR tuple with direct value
        const colorValueNodeId = Id.Node.make("test-color-value");
        // Create the node and set its text
        const ytext = Yjs.getText(colorValueNodeId);
        ytext.insert(0, "oklch(0.88 0.06 300)");

        yield* Tuple.create(System.TYPE_HAS_COLOR, [typeId, colorValueNodeId]);

        // Get fresh stream and take next emission
        const colorStream2 = yield* TypeColor.subscribeColors(typeId);
        const secondEmission = yield* Stream.runHead(colorStream2);

        if (secondEmission._tag === "Some") {
          // Should now have the new color
          expect(secondEmission.value.bg).toBe("oklch(0.88 0.06 300)");
          expect(secondEmission.value.fg).toBe("oklch(0.35 0.12 300)");
        } else {
          expect.fail("Expected second emission from color stream");
        }
      }).pipe(runtime.runPromise);
    });
  });

  describe("Auto color assignment", () => {
    it("automatically assigns a color from palette when a new type is created", async () => {
      await Effect.gen(function* () {
        const TypeColor = yield* TypeColorT;
        const TypePicker = yield* TypePickerT;
        const Tuple = yield* TupleT;

        // Create a new type via TypePicker (triggers auto-color assignment)
        const typeId = yield* TypePicker.createType("AutoColorType");

        // Check that TYPE_HAS_COLOR tuple was created automatically
        const colorTuples = yield* Tuple.findByPosition(
          System.TYPE_HAS_COLOR,
          0,
          typeId,
        );

        expect(colorTuples.length).toBe(1);

        // Verify the assigned color is from the palette
        const colorRef = colorTuples[0]?.members[1];
        expect(colorRef).toBeDefined();
        expect(COLOR_PALETTE).toContain(colorRef);

        // Colors should resolve successfully
        const colors = yield* TypeColor.getColors(typeId);
        expect(colors.bg).toMatch(/^oklch\(/);
        expect(colors.fg).toMatch(/^oklch\(/);
      }).pipe(runtime.runPromise);
    });
  });
});
