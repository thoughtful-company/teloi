import { Id, System } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { YjsT } from "@/services/external/Yjs";
import { Context, Effect, Layer, Stream } from "effect";
import { TypeColors, DEFAULT_COLORS } from "./types";

export type { TypeColors } from "./types";

// Regex to extract hue from oklch() color values
// Matches: oklch(L C H) where H is the hue value
const OKLCH_REGEX = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/;

/**
 * Derives foreground color from background color.
 * Extracts hue from oklch() and applies standard fg lightness/chroma.
 */
const deriveForeground = (bgColor: string): string => {
  const match = bgColor.match(OKLCH_REGEX);
  if (!match) {
    // Can't parse, return default foreground
    return DEFAULT_COLORS.fg;
  }
  const hue = match[3];
  return `oklch(0.35 0.12 ${hue})`;
};

export class TypeColorT extends Context.Tag("TypeColorT")<
  TypeColorT,
  {
    /**
     * Get resolved colors for a type (queries tuples, applies fallback).
     * Returns { bg, fg } for use in inline styles.
     */
    getColors: (typeId: Id.Node) => Effect.Effect<TypeColors>;

    /**
     * Subscribe to color changes for a type.
     * Emits whenever TYPE_HAS_COLOR or color definition tuples change.
     */
    subscribeColors: (typeId: Id.Node) => Effect.Effect<Stream.Stream<TypeColors>>;
  }
>() {}

/**
 * Resolve a color reference (from TYPE_HAS_COLOR) to actual bg/fg values.
 *
 * 1. Check if colorRef has COLOR_HAS_BACKGROUND and COLOR_HAS_FOREGROUND tuples
 *    - If yes: return those values
 * 2. Otherwise treat colorRef as a direct value node
 *    - Get its text content as background
 *    - Derive foreground from it
 */
const resolveColorRef = (colorRef: Id.Node) =>
  Effect.gen(function* () {
    const Tuple = yield* TupleT;
    const Yjs = yield* YjsT;

    // Check for COLOR_HAS_BACKGROUND tuple (position 0 = color node)
    const bgTuples = yield* Tuple.findByPosition(
      System.COLOR_HAS_BACKGROUND,
      0,
      colorRef,
    );
    const fgTuples = yield* Tuple.findByPosition(
      System.COLOR_HAS_FOREGROUND,
      0,
      colorRef,
    );

    const bgTuple = bgTuples[0];
    const fgTuple = fgTuples[0];
    const bgValueNodeId = bgTuple?.members[1];
    const fgValueNodeId = fgTuple?.members[1];

    if (bgValueNodeId && fgValueNodeId) {
      // Full color node with both bg and fg defined
      const bgText = Yjs.getText(bgValueNodeId).toString();
      const fgText = Yjs.getText(fgValueNodeId).toString();

      return { bg: bgText, fg: fgText } satisfies TypeColors;
    }

    // Direct value node - treat as background, derive foreground
    const bgText = Yjs.getText(colorRef).toString();
    if (bgText.length === 0) {
      return DEFAULT_COLORS;
    }

    return { bg: bgText, fg: deriveForeground(bgText) } satisfies TypeColors;
  });

export const TypeColorLive = Layer.effect(
  TypeColorT,
  Effect.gen(function* () {
    const Tuple = yield* TupleT;
    const Yjs = yield* YjsT;
    const context = Context.make(TupleT, Tuple).pipe(Context.add(YjsT, Yjs));

    const getColorsImpl = (typeId: Id.Node) =>
      Effect.gen(function* () {
        // Look up TYPE_HAS_COLOR for this type (position 0 = type node)
        const colorTuples = yield* Tuple.findByPosition(
          System.TYPE_HAS_COLOR,
          0,
          typeId,
        );

        const colorRef = colorTuples[0]?.members[1];
        if (!colorRef) {
          // No configured color - use default
          return yield* resolveColorRef(System.DEFAULT_TYPE_COLOR);
        }

        return yield* resolveColorRef(colorRef);
      }).pipe(Effect.provide(context), Effect.orDie);

    const subscribeColorsImpl = (typeId: Id.Node) =>
      Effect.gen(function* () {
        // Subscribe to TYPE_HAS_COLOR changes for this type
        const typeColorStream = yield* Tuple.subscribeByPosition(
          System.TYPE_HAS_COLOR,
          0,
          typeId,
        );

        // For each emission, resolve the color and provide context to the stream
        return typeColorStream.pipe(
          Stream.mapEffect((tuples) =>
            Effect.gen(function* () {
              const colorRef = tuples[0]?.members[1];
              if (!colorRef) {
                // No configured color - resolve default
                return yield* resolveColorRef(System.DEFAULT_TYPE_COLOR);
              }
              return yield* resolveColorRef(colorRef);
            }),
          ),
          Stream.provideContext(context),
        );
      }).pipe(Effect.provide(context), Effect.orDie);

    return {
      getColors: getColorsImpl,
      subscribeColors: subscribeColorsImpl,
    };
  }),
);
