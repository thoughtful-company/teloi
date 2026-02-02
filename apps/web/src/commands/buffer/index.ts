import { EditBlock } from "./editBlock";
import { Indent } from "./indent";
import { OpenTypePicker } from "./openTypePicker";
import { Outdent } from "./outdent";
import { ZoomIn } from "./zoomIn";
import { ZoomOut } from "./zoomOut";

export { EditBlock, Indent, OpenTypePicker, Outdent, ZoomIn, ZoomOut };

export const bufferCommands = [
  EditBlock,
  Indent,
  OpenTypePicker,
  Outdent,
  ZoomIn,
  ZoomOut,
] as const;

export type BufferCommand = InstanceType<(typeof bufferCommands)[number]>;
