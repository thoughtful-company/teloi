import { EditBlock } from "./editBlock";
import { Indent } from "./indent";
import { OpenTypePicker } from "./openTypePicker";
import { Outdent } from "./outdent";

export { EditBlock, Indent, OpenTypePicker, Outdent };

export const bufferCommands = [
  EditBlock,
  Indent,
  OpenTypePicker,
  Outdent,
] as const;

export type BufferCommand = InstanceType<(typeof bufferCommands)[number]>;
