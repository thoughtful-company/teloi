import { Id } from "@/schema";
import { TupleT } from "@/services/domain/Tuple";
import { TypeT } from "@/services/domain/Type";
import { StoreT } from "@/services/external/Store";
import { YjsT } from "@/services/external/Yjs";
import { withContext } from "@/utils";
import { Context, Effect, Layer, Stream } from "effect";
import { addLinkedBlock, type AddLinkedBlockOptions } from "./addLinkedBlock";
import { bindToTupleType } from "./bindToTupleType";
import { createProperty } from "./createProperty";
import { getLinkedBlocks } from "./getLinkedBlocks";
import { getLinkedTuples, type LinkedTuple } from "./getLinkedTuples";
import { getPropertiesForView } from "./getPropertiesForView";
import { quickCreateTupleType } from "./quickCreateTupleType";
import { subscribePropertiesForView } from "./subscribePropertiesForView";

export type { LinkedTuple };

/**
 * Information about a property linked to a view.
 */
export interface PropertyInfo {
  id: Id.Node;
  title: string;
  /** Whether the property is bound to a tuple type via PROPERTY_USES_TUPLE */
  isBound: boolean;
  /** The tuple type this property is bound to (if bound) */
  tupleTypeId?: Id.Node;
  /** Which position in the tuple contains the "host" page (0 or 1) */
  hostPosition?: 0 | 1;
  /** Which position in the tuple contains the "display" node (0 or 1) */
  displayPosition?: 0 | 1;
}

/**
 * PropertyT service manages property definitions for views.
 *
 * Properties define how relationships are displayed on pages.
 * They are children of SCHEMA, linked to views via HAS_PROPERTY tuples,
 * and can be bound to tuple types for actual data display.
 *
 * Key concepts:
 * - Property: A node under SCHEMA with type PROPERTY
 * - Binding: Links a property to a tuple type, specifying which position is the "host" (page)
 *   and which is the "display" (linked data)
 * - Linked blocks: Nodes that appear in the property's display, derived from tuple instances
 */
export class PropertyT extends Context.Tag("PropertyT")<
  PropertyT,
  {
    /**
     * Create a new property under SCHEMA, linked to the given view.
     * - Creates node as child of System.SCHEMA
     * - Sets type to System.PROPERTY
     * - Creates HAS_PROPERTY tuple linking view to property
     */
    createProperty: (viewId: Id.Node) => Effect.Effect<Id.Node>;

    /**
     * Get all properties for a view via HAS_PROPERTY tuples.
     * Returns PropertyInfo with title, binding status, and configuration.
     */
    getPropertiesForView: (viewId: Id.Node) => Effect.Effect<readonly PropertyInfo[]>;

    /**
     * Subscribe to properties for a view.
     * Emits whenever HAS_PROPERTY tuples change for the given view.
     */
    subscribePropertiesForView: (
      viewId: Id.Node,
    ) => Effect.Effect<Stream.Stream<readonly PropertyInfo[]>>;

    /**
     * Bind a property to a tuple type with position configuration.
     * - Creates PROPERTY_USES_TUPLE tuple linking property to tuple type
     * - Creates PROPERTY_CONFIG tuple with hostPosition and displayPosition
     *
     * @param propertyId - The property to bind
     * @param tupleTypeId - The tuple type to bind to
     * @param hostPosition - Which tuple position contains the "host" page (0 or 1)
     * @param displayPosition - Which tuple position contains the "display" node (0 or 1)
     */
    bindToTupleType: (
      propertyId: Id.Node,
      tupleTypeId: Id.Node,
      hostPosition: 0 | 1,
      displayPosition: 0 | 1,
    ) => Effect.Effect<void>;

    /**
     * Get linked blocks for a property on a given page.
     * Queries tuple instances of the bound tuple type where the page
     * is at the hostPosition, returns node IDs from the displayPosition.
     * @deprecated Use getLinkedTuples instead
     */
    getLinkedBlocks: (
      propertyId: Id.Node,
      pageId: Id.Node,
    ) => Effect.Effect<readonly Id.Node[]>;

    /**
     * Get linked tuples for a property on a given page.
     * Returns tuple instances with both tupleId and displayNodeId.
     * The tupleId identifies the relationship; displayNodeId is the node to render.
     */
    getLinkedTuples: (
      propertyId: Id.Node,
      pageId: Id.Node,
    ) => Effect.Effect<readonly LinkedTuple[]>;

    /**
     * Add a linked block to a property for a given page.
     * - Creates a new node (unless options.nodeId is provided)
     * - Creates a tuple instance with the bound tuple type,
     *   placing pageId at hostPosition and newNodeId at displayPosition
     *
     * @param options.nodeId - Pre-existing nodeId for ghost block materialization
     * @returns The ID of the newly created node
     */
    addLinkedBlock: (
      propertyId: Id.Node,
      pageId: Id.Node,
      options?: AddLinkedBlockOptions,
    ) => Effect.Effect<Id.Node>;

    /**
     * Quick-create a tuple type for an unbound property.
     * Triggered when user presses ArrowRight at end of unbound property name.
     *
     * Creates:
     * - Tuple Type named "{propertyName}_Tuple" as shadow child of SCHEMA
     * - Position 0 node with title = property name
     * - Position 1 node with title = "Is {name} For"
     * - Roles for both positions
     * - Binding with hostPosition=1, displayPosition=0
     * - Initial linked block
     *
     * @returns The ID of the newly created linked block
     */
    quickCreateTupleType: (propertyId: Id.Node) => Effect.Effect<Id.Node>;
  }
>() {}

export const PropertyLive = Layer.effect(
  PropertyT,
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
      createProperty: withContext(createProperty)(context),
      getPropertiesForView: withContext(getPropertiesForView)(context),
      subscribePropertiesForView: withContext(subscribePropertiesForView)(context),
      bindToTupleType: withContext(bindToTupleType)(context),
      getLinkedBlocks: withContext(getLinkedBlocks)(context),
      getLinkedTuples: withContext(getLinkedTuples)(context),
      addLinkedBlock: withContext(addLinkedBlock)(context),
      quickCreateTupleType: withContext(quickCreateTupleType)(context),
    };
  }),
);
