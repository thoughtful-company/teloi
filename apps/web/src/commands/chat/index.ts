import { Send } from "./send";

export { Send };

export const chatCommands = [Send] as const;

export type ChatCommand = InstanceType<(typeof chatCommands)[number]>;
