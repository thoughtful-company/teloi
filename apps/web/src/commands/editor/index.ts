import { Backspace } from "./backspace";
import { Delete } from "./delete";
import { DeleteToLineStart } from "./deleteToLineStart";
import { DeleteToLineEnd } from "./deleteToLineEnd";
import { Enter } from "./enter";
import { DeleteWordBackward } from "./deleteWordBackward";
import { DeleteWordForward } from "./deleteWordForward";
import { Left } from "./left";
import { Right } from "./right";
import { Up } from "./up";
import { Down } from "./down";
import { MoveToLineStart } from "./moveToLineStart";
import { MoveToLineEnd } from "./moveToLineEnd";
import { MoveWordLeft } from "./moveWordLeft";
import { MoveWordRight } from "./moveWordRight";
export {
  Backspace,
  Delete,
  DeleteToLineStart,
  DeleteToLineEnd,
  DeleteWordBackward,
  DeleteWordForward,
  Enter,
  Left,
  Right,
  Up,
  Down,
  MoveToLineStart,
  MoveToLineEnd,
  MoveWordLeft,
  MoveWordRight,
};

export const editorCommands = [
  Backspace,
  Delete,
  DeleteToLineStart,
  DeleteToLineEnd,
  DeleteWordBackward,
  DeleteWordForward,
  Enter,
  Left,
  Right,
  Up,
  Down,
  MoveToLineStart,
  MoveToLineEnd,
  MoveWordLeft,
  MoveWordRight,
] as const;

export type EditorCommand = InstanceType<(typeof editorCommands)[number]>;
