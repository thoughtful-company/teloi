import { System } from "@/schema";
import { BlockTypeDefinition } from "../types";

const ListBullet = () => (
  <span class="h-[var(--text-block)] flex items-center justify-center">
    <span class="w-1 h-1 rounded-full bg-current" />
  </span>
);

export const listElementDefinition: BlockTypeDefinition = {
  id: System.LIST_ELEMENT,

  renderDecoration: () => <ListBullet />,

  trigger: {
    pattern: /^-$/,
    consume: 1,
  },

  enter: {
    propagateToNewBlock: true,
    removeOnEmpty: true,
  },

  backspace: {
    removeTypeAtStart: true,
  },
};
