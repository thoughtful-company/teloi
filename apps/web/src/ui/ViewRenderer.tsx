import { Id } from "@/schema";
import type { ViewType } from "@/services/ui/View";
import { Dynamic } from "solid-js/web";
import type { Component } from "solid-js";
import ChatView from "./ChatView";
import PageView from "./PageView";
import TableView from "./TableView";

interface ViewRendererProps {
  viewType: ViewType;
  bufferId: Id.Buffer;
  nodeId: Id.Node;
  inline?: boolean;
}

const viewComponents: Record<
  ViewType,
  Component<{ bufferId: Id.Buffer; nodeId: Id.Node; inline?: boolean }>
> = {
  page: PageView,
  chat: ChatView,
  table: TableView,
};

/** Used by both BufferView (top-level) and Block (inline views). */
export default function ViewRenderer(props: ViewRendererProps) {
  return (
    <Dynamic
      component={viewComponents[props.viewType]}
      bufferId={props.bufferId}
      nodeId={props.nodeId}
      {...(props.inline ? { inline: true } : {})}
    />
  );
}
