import { Collapse } from "./collapse";
import { EditBlock } from "./editKhora";
import { Expand } from "./expand";
import { Indent } from "./indent";
import { OpenTypePicker } from "./openTypePicker";
import { Outdent } from "./outdent";
import { Space } from "./space";
import { ZoomIn } from "./zoomIn";
import { ZoomOut } from "./zoomOut";

export {
  Collapse,
  EditBlock,
  Expand,
  Indent,
  OpenTypePicker,
  Outdent,
  Space,
  ZoomIn,
  ZoomOut,
};

export const frameCommands = [
  Collapse,
  EditBlock,
  Expand,
  Indent,
  OpenTypePicker,
  Outdent,
  Space,
  ZoomIn,
  ZoomOut,
] as const;

export type FrameCommand = InstanceType<(typeof frameCommands)[number]>;
