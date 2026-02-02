import { EditBlock } from "./editBlock";
import { Indent } from "./indent";
import { Outdent } from "./outdent";

export { EditBlock, Indent, Outdent };

export const bufferCommands = [EditBlock, Indent, Outdent] as const;

export type BufferCommand = InstanceType<(typeof bufferCommands)[number]>;
