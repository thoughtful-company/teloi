/**
 * Spring-animated scroll utility.
 *
 * Provides smooth, physics-based scrolling with:
 * - Spring physics (stiffness: 180, damping: 26)
 * - WeakMap-based instance management (one scroller per container)
 * - Animation takeover (new scroll request smoothly updates target)
 * - 50px margin for scroll-into-view operations
 */

export const SCROLL_MARGIN = 50;
export const SPRING_STIFFNESS = 180;
export const SPRING_DAMPING = 26;

const RAMP_DURATION = 0.3; // seconds to reach full spring force
const POSITION_THRESHOLD = 0.5;
const VELOCITY_THRESHOLD = 0.5;

export interface SpringScroller {
  scrollTo(target: number): void;
  scrollBy(delta: number): void;
  cancel(): void;
}

class SpringScrollerImpl implements SpringScroller {
  private container: HTMLElement;
  private animationId: number | null = null;
  private position: number;
  private velocity = 0;
  private target: number;
  private startTime: number = 0;
  private lastTime: number = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.position = container.scrollTop;
    this.target = this.position;
  }

  scrollTo(targetScrollTop: number): void {
    this.target = targetScrollTop;

    // If no animation running, start one
    if (this.animationId === null) {
      this.position = this.container.scrollTop;
      this.velocity = 0;
      this.startTime = performance.now();
      this.lastTime = this.startTime;
      this.startAnimation();
    }
    // If animation is running, it will pick up the new target automatically
  }

  scrollBy(delta: number): void {
    // Always calculate target from current scrollTop, even during animation
    this.scrollTo(this.container.scrollTop + delta);
  }

  cancel(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  private startAnimation(): void {
    const tick = (now: number) => {
      const dt = Math.min((now - this.lastTime) / 1000, 0.064);
      this.lastTime = now;

      // Ease-in: ramp spring force from 0 to 1 over rampDuration
      const elapsed = (now - this.startTime) / 1000;
      const ramp = Math.min(elapsed / RAMP_DURATION, 1);
      // Smooth the ramp with ease-out curve for natural feel
      const smoothRamp = 1 - Math.pow(1 - ramp, 3);

      // Spring physics with ramped stiffness
      const displacement = this.position - this.target;
      const springForce = -SPRING_STIFFNESS * smoothRamp * displacement;
      const dampingForce = -SPRING_DAMPING * this.velocity;
      const acceleration = springForce + dampingForce;

      this.velocity += acceleration * dt;
      this.position += this.velocity * dt;

      this.container.scrollTop = this.position;

      const isSettled =
        Math.abs(this.position - this.target) < POSITION_THRESHOLD &&
        Math.abs(this.velocity) < VELOCITY_THRESHOLD;

      if (!isSettled) {
        this.animationId = requestAnimationFrame(tick);
      } else {
        this.container.scrollTop = this.target;
        this.animationId = null;
      }
    };

    this.animationId = requestAnimationFrame(tick);
  }
}

/**
 * WeakMap cache to maintain one scroller per container.
 * Using WeakMap ensures scrollers are garbage collected when containers are removed.
 */
const scrollerCache = new WeakMap<HTMLElement, SpringScroller>();

/**
 * Get or create a SpringScroller for the given container.
 * Uses WeakMap to maintain a single instance per container.
 */
export function getSpringScroller(container: HTMLElement): SpringScroller {
  const cached = scrollerCache.get(container);
  if (cached) return cached;

  const scroller = new SpringScrollerImpl(container);
  scrollerCache.set(container, scroller);
  return scroller;
}

interface RectLike {
  top: number;
  bottom: number;
}

/**
 * Calculate scroll delta needed to bring an element into view with margin.
 * Returns the delta to scroll by (positive = scroll down, negative = scroll up).
 * Returns 0 if element is already visible within margin.
 */
export function calculateScrollDelta(
  elementRect: RectLike,
  containerRect: DOMRect,
  margin: number = SCROLL_MARGIN,
): number {
  const topInContainer = elementRect.top - containerRect.top;
  const bottomInContainer = elementRect.bottom - containerRect.top;

  if (topInContainer < margin) {
    return topInContainer - margin;
  } else if (bottomInContainer > containerRect.height - margin) {
    return bottomInContainer - containerRect.height + margin;
  }

  return 0;
}

/**
 * Scroll an element into view with spring animation and margin.
 * Finds the nearest scrollable ancestor and uses spring animation.
 */
export function scrollElementIntoView(
  element: HTMLElement,
  margin: number = SCROLL_MARGIN,
): void {
  const scrollContainer = element.closest<HTMLElement>(
    ".overflow-y-auto, .overflow-auto",
  );
  if (!scrollContainer) return;

  const containerRect = scrollContainer.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();

  const delta = calculateScrollDelta(elementRect, containerRect, margin);
  if (delta !== 0) {
    getSpringScroller(scrollContainer).scrollBy(delta);
  }
}
