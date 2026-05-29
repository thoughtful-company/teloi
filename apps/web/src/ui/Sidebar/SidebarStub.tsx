import Icon, { type IconName } from "../Icon";

interface SidebarStubProps {
  icon: IconName;
  title: string;
  message: string;
}

// Placeholder body for nav views that are deferred in this redesign pass:
// Chat is a lens (§8) and Search is underdesigned/skipped (§8). Rendered so the
// nav pills are fully wired without shipping half-built features.
export default function SidebarStub(props: SidebarStubProps) {
  return (
    <div class="flex flex-1 flex-col items-center justify-center gap-2 px-6 pb-12 text-center">
      <Icon name={props.icon} class="size-7 text-text-placeholder" />
      <div class="text-sm font-medium text-text-secondary">{props.title}</div>
      <div class="text-sm text-text-placeholder">{props.message}</div>
    </div>
  );
}
