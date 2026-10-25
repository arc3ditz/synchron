import {
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

const VIEWPORT_GUTTER = 8;
const ANCHOR_GAP = 6;

interface PopoverPosition {
  top: number;
  left: number;
  maxHeight: number;
}

interface AnchoredPopoverProps {
  label: string;
  /** Visible trigger text when it should differ from the accessible label. */
  triggerLabel?: ReactNode;
  icon?: ReactNode;
  className?: string;
  /**
   * Move focus to the first item when the popover opens. Content that manages
   * its own initial focus (the date picker) opts out.
   */
  focusOnOpen?: boolean;
  children: (close: () => void) => ReactNode;
}

export function AnchoredPopover({
  label,
  triggerLabel,
  icon,
  className = "",
  focusOnOpen = true,
  children,
}: AnchoredPopoverProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PopoverPosition>();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const focusOnOpenRef = useRef(false);

  const close = useCallback((restoreFocus = true) => {
    focusOnOpenRef.current = false;
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(undefined);
      return;
    }

    const updatePosition = () => {
      const trigger = triggerRef.current;
      const popover = popoverRef.current;
      if (!trigger || !popover) return;

      const anchor = trigger.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      const availableWidth = Math.max(0, viewportWidth - VIEWPORT_GUTTER * 2);
      const width = Math.min(popover.offsetWidth, availableWidth);
      const naturalHeight = Math.min(popover.scrollHeight, viewportHeight - VIEWPORT_GUTTER * 2);
      const belowTop = anchor.bottom + ANCHOR_GAP;
      const aboveTop = anchor.top - naturalHeight - ANCHOR_GAP;
      const belowSpace = viewportHeight - VIEWPORT_GUTTER - belowTop;
      const aboveSpace = anchor.top - ANCHOR_GAP - VIEWPORT_GUTTER;

      let top: number;
      let maxHeight: number;
      if (naturalHeight <= belowSpace) {
        top = belowTop;
        maxHeight = belowSpace;
      } else if (naturalHeight <= aboveSpace) {
        top = aboveTop;
        maxHeight = aboveSpace;
      } else if (belowSpace >= aboveSpace) {
        top = belowTop;
        maxHeight = Math.max(0, belowSpace);
      } else {
        maxHeight = Math.max(0, aboveSpace);
        top = Math.max(VIEWPORT_GUTTER, anchor.top - ANCHOR_GAP - maxHeight);
      }

      const centeredLeft = anchor.left + anchor.width / 2 - width / 2;
      const left = Math.min(
        Math.max(VIEWPORT_GUTTER, centeredLeft),
        Math.max(VIEWPORT_GUTTER, viewportWidth - width - VIEWPORT_GUTTER),
      );
      setPosition({ top, left, maxHeight });
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !popoverRef.current?.contains(target)) {
        close(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };

    updatePosition();
    const frame = requestAnimationFrame(updatePosition);
    // Menus take focus so keyboard users can reach their options without
    // tabbing through the rest of the page. The date picker moves focus itself,
    // so this only acts when focus is still on the trigger.
    const focusFrame = focusOnOpen && focusOnOpenRef.current
      ? requestAnimationFrame(() => {
          focusOnOpenRef.current = false;
          const popover = popoverRef.current;
          if (!popover || popover.contains(document.activeElement)) return;
          popover
            .querySelector<HTMLElement>(
              'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
            )
            ?.focus();
        })
      : undefined;
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      if (focusFrame !== undefined) cancelAnimationFrame(focusFrame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [close, open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`meta-trigger ${className}`}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          if (!open) focusOnOpenRef.current = true;
          setOpen((current) => !current);
        }}
      >
        {icon && <span className="meta-trigger__icon">{icon}</span>}
        <span className="meta-trigger__label">{triggerLabel ?? label}</span>
      </button>
      {open && createPortal(
        <div
          ref={popoverRef}
          className="metadata-popover"
          role="dialog"
          aria-label={label}
          style={{
            top: position?.top ?? VIEWPORT_GUTTER,
            left: position?.left ?? VIEWPORT_GUTTER,
            maxHeight: position?.maxHeight,
            visibility: position ? "visible" : "hidden",
          }}
        >
          {children(() => close())}
        </div>,
        document.body,
      )}
    </>
  );
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span
      className="tooltip-anchor"
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      {children}
      <span id={id} className="tooltip" role="tooltip" data-visible={open || undefined}>
        {label}
      </span>
    </span>
  );
}

interface ConfirmationOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  /** Control that opens the dialog; focus returns here when it closes. */
  trigger?: HTMLElement | null;
}

const ConfirmationContext = createContext<(options: ConfirmationOptions) => void>(() => {
  throw new Error("useConfirm must be used within ConfirmationProvider");
});

export function useConfirm() {
  return useContext(ConfirmationContext);
}

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmationOptions>();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  const confirm = useCallback((options: ConfirmationOptions) => {
    const active = document.activeElement;
    triggerRef.current =
      options.trigger ?? (active instanceof HTMLElement && active !== document.body ? active : null);
    setRequest(options);
  }, []);
  const cancel = useCallback(() => setRequest(undefined), []);

  useLayoutEffect(() => {
    if (!request) return;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancel();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!active || !dialog.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      const trigger = triggerRef.current;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [cancel, request]);

  return (
    <ConfirmationContext.Provider value={confirm}>
      {children}
      {request && createPortal(
        <div className="dialog-backdrop" onPointerDown={(event) => {
          if (event.target === event.currentTarget) cancel();
        }}>
          <div
            ref={dialogRef}
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            tabIndex={-1}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <h2 id={titleId} className="confirm-dialog__title">{request.title}</h2>
            <p id={descriptionId} className="confirm-dialog__description">{request.description}</p>
            <div className="confirm-dialog__actions">
              <button ref={cancelRef} type="button" className="action-button confirm-dialog__cancel" onClick={cancel}>
                Cancel
              </button>
              <button type="button" className="action-button confirm-dialog__delete" onClick={() => {
                const onConfirm = request.onConfirm;
                setRequest(undefined);
                onConfirm();
              }}>
                {request.confirmLabel ?? "Delete"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </ConfirmationContext.Provider>
  );
}
