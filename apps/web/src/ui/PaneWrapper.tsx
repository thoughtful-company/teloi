import { cn } from "@/utils/styling";
import { cva } from "class-variance-authority";
import { JSX } from "solid-js";

const contentVariants = cva("mx-auto px-[var(--spacing-panel-x)]", {
  variants: {
    spacing: {
      narrow: "max-w-[var(--max-line-width)]",
      wide: "w-full",
    },
  },
  defaultVariants: {
    spacing: "narrow",
  },
});

/**
 * Wraps content in a styled pane container.
 *
 * @param children - The content to render inside the pane
 * @returns The rendered pane wrapper element
 */
export default function PaneWrapper({ children }: { children: JSX.Element }) {
  return (
    <section class="flex-1 shadow-daiichi bg-white rounded-lg pt-10 overflow-y-visible overflow-x-hidden">
      <div class={cn(contentVariants({ spacing: "narrow" }))}>{children}</div>
    </section>
  );
}