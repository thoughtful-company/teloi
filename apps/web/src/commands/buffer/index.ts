import { Indent } from "./indent";
import { Outdent } from "./outdent";

export { Indent, Outdent };

export const bufferCommands = [Indent, Outdent] as const;

export type BufferCommand = InstanceType<(typeof bufferCommands)[number]>;
