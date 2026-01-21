import { createRoot, createSignal } from "solid-js";
import { describe, expect, it } from "vitest";
import { useClickCapture } from "@/ui/hooks/useClickCapture";

/** Wait for SolidJS effects to flush (they run in microtasks) */
const flushEffects = () =>
  new Promise<void>((resolve) => queueMicrotask(() => resolve()));

describe("useClickCapture", () => {
  describe("capture and get", () => {
    it("starts with null coords", () => {
      createRoot((dispose) => {
        const [isActive] = createSignal(false);
        const clickCapture = useClickCapture({ isActive });

        expect(clickCapture.get()).toBeNull();
        dispose();
      });
    });

    it("stores coords from capture()", () => {
      createRoot((dispose) => {
        const [isActive] = createSignal(false);
        const clickCapture = useClickCapture({ isActive });

        const mockEvent = { clientX: 100, clientY: 200 } as MouseEvent;
        clickCapture.capture(mockEvent);

        expect(clickCapture.get()).toEqual({ x: 100, y: 200 });
        dispose();
      });
    });

    it("overwrites coords on subsequent capture()", () => {
      createRoot((dispose) => {
        const [isActive] = createSignal(false);
        const clickCapture = useClickCapture({ isActive });

        clickCapture.capture({ clientX: 100, clientY: 200 } as MouseEvent);
        clickCapture.capture({ clientX: 300, clientY: 400 } as MouseEvent);

        expect(clickCapture.get()).toEqual({ x: 300, y: 400 });
        dispose();
      });
    });
  });

  describe("reactive cleanup", () => {
    it("clears coords when isActive changes from true to false", async () => {
      await createRoot(async (dispose) => {
        const [isActive, setIsActive] = createSignal(true);
        const clickCapture = useClickCapture({ isActive });

        // Capture coords while active
        clickCapture.capture({ clientX: 100, clientY: 200 } as MouseEvent);
        expect(clickCapture.get()).toEqual({ x: 100, y: 200 });

        // Deactivate - should clear coords (effect runs in microtask)
        setIsActive(false);
        await flushEffects();

        expect(clickCapture.get()).toBeNull();
        dispose();
      });
    });

    it("does NOT clear coords when isActive changes from false to true", () => {
      createRoot((dispose) => {
        const [isActive, setIsActive] = createSignal(false);
        const clickCapture = useClickCapture({ isActive });

        // Capture coords while inactive
        clickCapture.capture({ clientX: 100, clientY: 200 } as MouseEvent);
        expect(clickCapture.get()).toEqual({ x: 100, y: 200 });

        // Activate - should preserve coords
        setIsActive(true);

        expect(clickCapture.get()).toEqual({ x: 100, y: 200 });
        dispose();
      });
    });

    it("does NOT clear coords when isActive stays true", () => {
      createRoot((dispose) => {
        const [isActive, setIsActive] = createSignal(true);
        const clickCapture = useClickCapture({ isActive });

        clickCapture.capture({ clientX: 100, clientY: 200 } as MouseEvent);

        // "Change" to same value - should not trigger cleanup
        setIsActive(true);

        expect(clickCapture.get()).toEqual({ x: 100, y: 200 });
        dispose();
      });
    });

    it("handles multiple activation cycles", async () => {
      await createRoot(async (dispose) => {
        const [isActive, setIsActive] = createSignal(true);
        const clickCapture = useClickCapture({ isActive });

        // First cycle
        clickCapture.capture({ clientX: 10, clientY: 20 } as MouseEvent);
        setIsActive(false);
        await flushEffects();
        expect(clickCapture.get()).toBeNull();

        // Second cycle
        setIsActive(true);
        clickCapture.capture({ clientX: 30, clientY: 40 } as MouseEvent);
        expect(clickCapture.get()).toEqual({ x: 30, y: 40 });

        setIsActive(false);
        await flushEffects();
        expect(clickCapture.get()).toBeNull();

        dispose();
      });
    });
  });
});
