import { Collapse } from "./collapse";
import { EditBlock } from "./editBlock";
import { Expand } from "./expand";
import { Indent } from "./indent";
import { OpenTypePicker } from "./openTypePicker";
import { Outdent } from "./outdent";
import { ZoomIn } from "./zoomIn";
import { ZoomOut } from "./zoomOut";

export {
  Collapse,
  EditBlock,
  Expand,
  Indent,
  OpenTypePicker,
  Outdent,
  ZoomIn,
  ZoomOut,
};

export const bufferCommands = [
  Collapse,
  EditBlock,
  Expand,
  Indent,
  OpenTypePicker,
  Outdent,
  ZoomIn,
  ZoomOut,
] as const;

export type BufferCommand = InstanceType<(typeof bufferCommands)[number]>;
