import "@/index.css";
import { Id } from "@/schema";
import EditorBuffer from "@/ui/EditorBuffer";
import { Effect } from "effect";
import { beforeEach, describe, it } from "vitest";
import {
  Given,
  Then,
  When,
  setupClientTest,
  type BrowserRuntime,
} from "../bdd";

describe("Block Down+Up navigation", () => {
  let runtime: BrowserRuntime;
  let render: Awaited<ReturnType<typeof setupClientTest>>["render"];
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    if (cleanup) await cleanup();

    const setup = await setupClientTest();
    runtime = setup.runtime;
    render = setup.render;
    cleanup = setup.cleanup;
  });

  it("Down then Up within wrapped text should return to original position, not jump to previous block", async () => {
    await Effect.gen(function* () {
      // Structure (siblings):
      // - Title: "Root"
      //   - "Node A" (first sibling)
      //   - Long Ukrainian text that wraps (second sibling)
      const { bufferId, childNodeIds } = yield* Given.A_BUFFER_WITH_CHILDREN(
        "Root",
        [
          { text: "Node A" },
          {
            text: "Історія Рекі нагадує, що ми не острови, що самотньо дрейфують у темряві. Ми — пов'язані невидимими та таємничими мостами довіри та емпатії. Її порятунок здобувся через нагороду за роки самопожертви, а став даром, отриманим в єдиний момент, коли вона дозволила собі бути вразливою перед кимось. Ми рятуємося не поодинці, а лише разом, стаючи одне для одного тим світлом, яке здатне розвіяти найтемнішу ніч душі.",
          },
        ],
      );

      const longTextBlockId = Id.makeBlockId(bufferId, childNodeIds[1]);

      render(() => <EditorBuffer bufferId={bufferId} />);

      yield* Given.BUFFER_HAS_WIDTH(800);

      yield* When.USER_CLICKS_BLOCK(longTextBlockId);
      yield* When.SELECTION_IS_SET_TO(bufferId, childNodeIds[1], 0);
      yield* When.USER_PRESSES("{Meta>}{ArrowRight}{/Meta}");

      yield* When.USER_PRESSES("{ArrowDown}");

      yield* Then.SELECTION_IS_ON_BLOCK(longTextBlockId);

      yield* When.USER_PRESSES("{ArrowUp}");

      yield* Then.SELECTION_IS_ON_BLOCK(longTextBlockId);
    }).pipe(runtime.runPromise);
  });
});
