import { Popover } from '@base-ui/react/popover';
import type { ReactNode } from 'react';

export const workspaceRow =
  'flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-[var(--beat-text-1)] hover:bg-white/7 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--beat-graph)] disabled:opacity-40';

/** Small, keyboard-accessible workspace menus without a backdrop over the canvas. */
export function WorkspacePopover({
  trigger,
  label,
  children,
  open,
  onOpenChange,
  align = 'start',
  className = '',
}: {
  trigger: ReactNode;
  label: string;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: 'start' | 'end';
  className?: string;
}) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger
        aria-label={label}
        className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-2.5 text-sm text-[var(--beat-text-1)] hover:bg-white/7 focus-visible:ring-2 focus-visible:ring-[var(--beat-graph)] ${className}`}
      >
        {trigger}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          sideOffset={8}
          align={align}
          collisionPadding={12}
          className="z-[90]"
        >
          <Popover.Popup className="max-h-[min(75vh,640px)] w-[min(320px,calc(100vw-24px))] overflow-y-auto rounded-xl border border-white/10 bg-[var(--beat-surface)] p-2 text-[var(--beat-text-1)] shadow-xl outline-none">
            <Popover.Title className="sr-only">{label}</Popover.Title>
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
