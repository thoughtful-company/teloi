import { System } from "@/schema";
import { BlockTypeDefinition } from "../types";

export const header1Definition: BlockTypeDefinition = {
  id: System.HEADER_1,
  isDecorative: true,

  contentClassName:
    "text-[length:var(--text-h1)] leading-[var(--text-h1--line-height)] min-h-[var(--text-h1--line-height)] font-semibold",

  trigger: {
    pattern: /^#$/,
    consume: 1,
  },

  enter: {
    propagateToNewBlock: false,
    removeOnEmpty: true,
  },

  backspace: {
    removeTypeAtStart: true,
  },
};

export const header2Definition: BlockTypeDefinition = {
  id: System.HEADER_2,
  isDecorative: true,

  contentClassName:
    "text-[length:var(--text-h2)] leading-[var(--text-h2--line-height)] min-h-[var(--text-h2--line-height)] font-semibold",

  trigger: {
    pattern: /^##$/,
    consume: 2,
  },

  enter: {
    propagateToNewBlock: false,
    removeOnEmpty: true,
  },

  backspace: {
    removeTypeAtStart: true,
  },
};

export const header3Definition: BlockTypeDefinition = {
  id: System.HEADER_3,
  isDecorative: true,

  contentClassName:
    "text-[length:var(--text-h3)] leading-[var(--text-h3--line-height)] min-h-[var(--text-h3--line-height)] font-medium",

  trigger: {
    pattern: /^###$/,
    consume: 3,
  },

  enter: {
    propagateToNewBlock: false,
    removeOnEmpty: true,
  },

  backspace: {
    removeTypeAtStart: true,
  },
};
