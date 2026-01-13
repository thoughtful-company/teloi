import { events, tables } from "@/livestore/schema";
import { Id, System } from "@/schema";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { withContext } from "@/utils";
import { Context, Effect, Layer } from "effect";
import { generateKeyBetween } from "fractional-indexing";
import { TypeT } from "../Type";
import { TupleT } from "../Tuple";

export class BootstrapT extends Context.Tag("BootstrapT")<
  BootstrapT,
  {
    /**
     * Ensures all system nodes exist. Idempotent - safe to call multiple times.
     */
    ensureSystemNodes: () => Effect.Effect<void>;
  }
>() {}

const nodeExists = (nodeId: Id.Node) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const node = yield* Store.query(
      tables.nodes
        .select()
        .where({ id: nodeId })
        .first({ fallback: () => null }),
    );
    return node !== null;
  });

const createRootNode = (nodeId: Id.Node, position: string) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: {
          nodeId,
          parentId: undefined,
          position,
        },
      }),
    );
  });

const createChildNode = (
  nodeId: Id.Node,
  parentId: Id.Node,
  position: string,
) =>
  Effect.gen(function* () {
    const Store = yield* StoreT;
    yield* Store.commit(
      events.nodeCreated({
        timestamp: Date.now(),
        data: {
          nodeId,
          parentId,
          position,
        },
      }),
    );
  });

const setNodeText = (nodeId: Id.Node, text: string) =>
  Effect.gen(function* () {
    const Yjs = yield* YjsT;
    const yText = Yjs.getText(nodeId);
    if (yText.length === 0) {
      yText.insert(0, text);
    }
  });

// Helper to get next position after a given position
const nextPosition = (prevPos: string | null) =>
  generateKeyBetween(prevPos, null);

// Helper to create a full color node with bg/fg values and tuples
const createColorNode = (
  colorId: Id.Node,
  bgId: Id.Node,
  fgId: Id.Node,
  name: string,
  hue: number,
) =>
  Effect.gen(function* () {
    const Type = yield* TypeT;
    const Tuple = yield* TupleT;

    // Create color node
    let pos = generateKeyBetween(null, null);
    yield* createChildNode(colorId, System.ROOT, pos);
    yield* setNodeText(colorId, name);
    yield* Type.addType(colorId, System.COLOR);

    // Create background value node
    pos = nextPosition(pos);
    yield* createChildNode(bgId, System.ROOT, pos);
    yield* setNodeText(bgId, `oklch(0.92 0.05 ${hue})`);

    // Create foreground value node
    pos = nextPosition(pos);
    yield* createChildNode(fgId, System.ROOT, pos);
    yield* setNodeText(fgId, `oklch(0.35 0.12 ${hue})`);

    // Create COLOR_HAS_BACKGROUND tuple
    yield* Tuple.create(System.COLOR_HAS_BACKGROUND, [colorId, bgId]);

    // Create COLOR_HAS_FOREGROUND tuple
    yield* Tuple.create(System.COLOR_HAS_FOREGROUND, [colorId, fgId]);
  });

const ensureSystemNodes = () =>
  Effect.gen(function* () {
    const Type = yield* TypeT;
    const Tuple = yield* TupleT;

    // === System Root ===
    const rootExists = yield* nodeExists(System.ROOT);
    if (!rootExists) {
      yield* createRootNode(System.ROOT, generateKeyBetween(null, null));
      yield* setNodeText(System.ROOT, "System");
    }

    // === Rendering Type (meta-type) ===
    let pos = generateKeyBetween(null, null);
    const renderingTypeExists = yield* nodeExists(System.RENDERING_TYPE);
    if (!renderingTypeExists) {
      yield* createChildNode(System.RENDERING_TYPE, System.ROOT, pos);
      yield* setNodeText(System.RENDERING_TYPE, "Rendering Type");
    }

    // === List Element (rendering type) ===
    pos = nextPosition(pos);
    const listElementExists = yield* nodeExists(System.LIST_ELEMENT);
    if (!listElementExists) {
      yield* createChildNode(System.LIST_ELEMENT, System.ROOT, pos);
      yield* setNodeText(System.LIST_ELEMENT, "List Element");
    }
    if (!(yield* Type.hasType(System.LIST_ELEMENT, System.RENDERING_TYPE))) {
      yield* Type.addType(System.LIST_ELEMENT, System.RENDERING_TYPE);
    }

    // === Boolean Type ===
    pos = nextPosition(pos);
    const booleanExists = yield* nodeExists(System.BOOLEAN);
    if (!booleanExists) {
      yield* createChildNode(System.BOOLEAN, System.ROOT, pos);
      yield* setNodeText(System.BOOLEAN, "Boolean");
    }

    // === True (boolean value) ===
    pos = nextPosition(pos);
    const trueExists = yield* nodeExists(System.TRUE);
    if (!trueExists) {
      yield* createChildNode(System.TRUE, System.ROOT, pos);
      yield* setNodeText(System.TRUE, "True");
    }
    if (!(yield* Type.hasType(System.TRUE, System.BOOLEAN))) {
      yield* Type.addType(System.TRUE, System.BOOLEAN);
    }

    // === False (boolean value) ===
    pos = nextPosition(pos);
    const falseExists = yield* nodeExists(System.FALSE);
    if (!falseExists) {
      yield* createChildNode(System.FALSE, System.ROOT, pos);
      yield* setNodeText(System.FALSE, "False");
    }
    if (!(yield* Type.hasType(System.FALSE, System.BOOLEAN))) {
      yield* Type.addType(System.FALSE, System.BOOLEAN);
    }

    // === Tuple Type (meta-type) ===
    pos = nextPosition(pos);
    const tupleTypeExists = yield* nodeExists(System.TUPLE_TYPE);
    if (!tupleTypeExists) {
      yield* createChildNode(System.TUPLE_TYPE, System.ROOT, pos);
      yield* setNodeText(System.TUPLE_TYPE, "Tuple Type");
    }

    // === IS_CHECKED (tuple type for checkbox state) ===
    pos = nextPosition(pos);
    const isCheckedExists = yield* nodeExists(System.IS_CHECKED);
    if (!isCheckedExists) {
      yield* createChildNode(System.IS_CHECKED, System.ROOT, pos);
      yield* setNodeText(System.IS_CHECKED, "Is Checked");
      yield* Type.addType(System.IS_CHECKED, System.TUPLE_TYPE);
      // Define IS_CHECKED schema: position 0 = subject (any node), position 1 = value (boolean)
      yield* Tuple.addRole(System.IS_CHECKED, 0, "subject", true);
      yield* Tuple.addRole(System.IS_CHECKED, 1, "value", true);
      yield* Tuple.addAllowedType(System.IS_CHECKED, 1, System.BOOLEAN);
    }

    // === Checkbox (rendering type) ===
    pos = nextPosition(pos);
    const checkboxExists = yield* nodeExists(System.CHECKBOX);
    if (!checkboxExists) {
      yield* createChildNode(System.CHECKBOX, System.ROOT, pos);
      yield* setNodeText(System.CHECKBOX, "Checkbox");
    }
    if (!(yield* Type.hasType(System.CHECKBOX, System.RENDERING_TYPE))) {
      yield* Type.addType(System.CHECKBOX, System.RENDERING_TYPE);
    }

    // === Color (meta-type for color nodes) ===
    pos = nextPosition(pos);
    const colorExists = yield* nodeExists(System.COLOR);
    if (!colorExists) {
      yield* createChildNode(System.COLOR, System.ROOT, pos);
      yield* setNodeText(System.COLOR, "Color");
    }

    // === COLOR_HAS_BACKGROUND (tuple type) ===
    pos = nextPosition(pos);
    const colorHasBgExists = yield* nodeExists(System.COLOR_HAS_BACKGROUND);
    if (!colorHasBgExists) {
      yield* createChildNode(System.COLOR_HAS_BACKGROUND, System.ROOT, pos);
      yield* setNodeText(System.COLOR_HAS_BACKGROUND, "Color Has Background");
      yield* Type.addType(System.COLOR_HAS_BACKGROUND, System.TUPLE_TYPE);
      // Schema: position 0 = color node, position 1 = value node (CSS string)
      yield* Tuple.addRole(System.COLOR_HAS_BACKGROUND, 0, "color", true);
      yield* Tuple.addRole(System.COLOR_HAS_BACKGROUND, 1, "value", true);
    }

    // === COLOR_HAS_FOREGROUND (tuple type) ===
    pos = nextPosition(pos);
    const colorHasFgExists = yield* nodeExists(System.COLOR_HAS_FOREGROUND);
    if (!colorHasFgExists) {
      yield* createChildNode(System.COLOR_HAS_FOREGROUND, System.ROOT, pos);
      yield* setNodeText(System.COLOR_HAS_FOREGROUND, "Color Has Foreground");
      yield* Type.addType(System.COLOR_HAS_FOREGROUND, System.TUPLE_TYPE);
      // Schema: position 0 = color node, position 1 = value node (CSS string)
      yield* Tuple.addRole(System.COLOR_HAS_FOREGROUND, 0, "color", true);
      yield* Tuple.addRole(System.COLOR_HAS_FOREGROUND, 1, "value", true);
    }

    // === TYPE_HAS_COLOR (tuple type) ===
    pos = nextPosition(pos);
    const typeHasColorExists = yield* nodeExists(System.TYPE_HAS_COLOR);
    if (!typeHasColorExists) {
      yield* createChildNode(System.TYPE_HAS_COLOR, System.ROOT, pos);
      yield* setNodeText(System.TYPE_HAS_COLOR, "Type Has Color");
      yield* Type.addType(System.TYPE_HAS_COLOR, System.TUPLE_TYPE);
      // Schema: position 0 = type node, position 1 = color (node or direct value)
      yield* Tuple.addRole(System.TYPE_HAS_COLOR, 0, "type", true);
      yield* Tuple.addRole(System.TYPE_HAS_COLOR, 1, "color", true);
    }

    // === DEFAULT_TYPE_COLOR (color node with green hue 145) ===
    pos = nextPosition(pos);
    const defaultColorExists = yield* nodeExists(System.DEFAULT_TYPE_COLOR);
    if (!defaultColorExists) {
      yield* createChildNode(System.DEFAULT_TYPE_COLOR, System.ROOT, pos);
      yield* setNodeText(System.DEFAULT_TYPE_COLOR, "Default Type Color");
      yield* Type.addType(System.DEFAULT_TYPE_COLOR, System.COLOR);

      // Create background value node
      pos = nextPosition(pos);
      yield* createChildNode(System.DEFAULT_TYPE_COLOR_BG, System.ROOT, pos);
      yield* setNodeText(System.DEFAULT_TYPE_COLOR_BG, "oklch(0.92 0.05 145)");

      // Create foreground value node
      pos = nextPosition(pos);
      yield* createChildNode(System.DEFAULT_TYPE_COLOR_FG, System.ROOT, pos);
      yield* setNodeText(System.DEFAULT_TYPE_COLOR_FG, "oklch(0.35 0.12 145)");

      // Create COLOR_HAS_BACKGROUND tuple
      yield* Tuple.create(System.COLOR_HAS_BACKGROUND, [
        System.DEFAULT_TYPE_COLOR,
        System.DEFAULT_TYPE_COLOR_BG,
      ]);

      // Create COLOR_HAS_FOREGROUND tuple
      yield* Tuple.create(System.COLOR_HAS_FOREGROUND, [
        System.DEFAULT_TYPE_COLOR,
        System.DEFAULT_TYPE_COLOR_FG,
      ]);
    }

    // === Color Palette (5 additional colors for auto-assignment) ===
    // Blue (hue 250)
    if (!(yield* nodeExists(System.COLOR_BLUE))) {
      yield* createColorNode(
        System.COLOR_BLUE,
        System.COLOR_BLUE_BG,
        System.COLOR_BLUE_FG,
        "Blue",
        250,
      );
    }

    // Purple (hue 300)
    if (!(yield* nodeExists(System.COLOR_PURPLE))) {
      yield* createColorNode(
        System.COLOR_PURPLE,
        System.COLOR_PURPLE_BG,
        System.COLOR_PURPLE_FG,
        "Purple",
        300,
      );
    }

    // Pink (hue 350)
    if (!(yield* nodeExists(System.COLOR_PINK))) {
      yield* createColorNode(
        System.COLOR_PINK,
        System.COLOR_PINK_BG,
        System.COLOR_PINK_FG,
        "Pink",
        350,
      );
    }

    // Orange (hue 70)
    if (!(yield* nodeExists(System.COLOR_ORANGE))) {
      yield* createColorNode(
        System.COLOR_ORANGE,
        System.COLOR_ORANGE_BG,
        System.COLOR_ORANGE_FG,
        "Orange",
        70,
      );
    }

    // Teal (hue 180)
    if (!(yield* nodeExists(System.COLOR_TEAL))) {
      yield* createColorNode(
        System.COLOR_TEAL,
        System.COLOR_TEAL_BG,
        System.COLOR_TEAL_FG,
        "Teal",
        180,
      );
    }

    // === Workspace Home ===
    let rootPos = generateKeyBetween(generateKeyBetween(null, null), null);
    const workspaceExists = yield* nodeExists(System.WORKSPACE);
    if (!workspaceExists) {
      yield* createRootNode(System.WORKSPACE, rootPos);
      yield* setNodeText(System.WORKSPACE, "Home");
    }

    // === Inbox (root node) ===
    rootPos = nextPosition(rootPos);
    const inboxExists = yield* nodeExists(System.INBOX);
    if (!inboxExists) {
      yield* createRootNode(System.INBOX, rootPos);
      yield* setNodeText(System.INBOX, "Inbox");
    }

    // === The Box (root node) ===
    rootPos = nextPosition(rootPos);
    const theBoxExists = yield* nodeExists(System.THE_BOX);
    if (!theBoxExists) {
      yield* createRootNode(System.THE_BOX, rootPos);
      yield* setNodeText(System.THE_BOX, "The Box");
    }

    // === Calendar (root node) ===
    rootPos = nextPosition(rootPos);
    const calendarExists = yield* nodeExists(System.CALENDAR);
    if (!calendarExists) {
      yield* createRootNode(System.CALENDAR, rootPos);
      yield* setNodeText(System.CALENDAR, "Calendar");
    }

    // === Types (root node for user-created types) ===
    rootPos = nextPosition(rootPos);
    const typesExists = yield* nodeExists(System.TYPES);
    if (!typesExists) {
      yield* createRootNode(System.TYPES, rootPos);
      yield* setNodeText(System.TYPES, "Types");
    }
  });

export const BootstrapLive = Layer.effect(
  BootstrapT,
  Effect.gen(function* () {
    const Store = yield* StoreT;
    const Type = yield* TypeT;
    const Tuple = yield* TupleT;
    const Yjs = yield* YjsT;
    const context = Context.make(StoreT, Store).pipe(
      Context.add(TypeT, Type),
      Context.add(TupleT, Tuple),
      Context.add(YjsT, Yjs),
    );

    return {
      ensureSystemNodes: withContext(ensureSystemNodes)(context),
    };
  }),
);
