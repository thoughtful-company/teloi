import { Left } from "./left";
import { Right } from "./right";
import { Up } from "./up";
import { Down } from "./down";
import { Home } from "./home";
import { End } from "./end";

export { Left, Right, Up, Down, Home, End };

export const editorCommands = [Left, Right, Up, Down, Home, End] as const;

export type EditorCommand = InstanceType<(typeof editorCommands)[number]>;
