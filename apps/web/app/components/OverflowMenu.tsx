"use client";

import { createPortal } from "react-dom";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

const MENU_OPEN_EVENT = "finhance:overflow-menu-open";
const VIEWPORT_PADDING = 16;
const PANEL_GAP = 12;

type OverflowMenuOpenEvent = CustomEvent<{ id: string }>;

type TriggerProps = Pick<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-controls" | "aria-expanded" | "aria-haspopup" | "onClick" | "type"
>;

type OverflowMenuTriggerRenderArgs = {
  isOpen: boolean;
  triggerProps: TriggerProps;
  triggerRef: RefObject<HTMLButtonElement | null>;
};

type OverflowMenuChildrenRenderArgs = {
  closeMenu: (options?: { restoreFocus?: boolean }) => void;
};

function isMenuItemDisabled(element: HTMLElement): boolean {
  if (element.getAttribute("aria-disabled") === "true") {
    return true;
  }

  if (
    element instanceof HTMLButtonElement ||
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  ) {
    return element.disabled;
  }

  return false;
}

function getEnabledMenuItems(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    .filter((element) => !isMenuItemDisabled(element));
}

export function OverflowMenuDivider() {
  return <div className="overflow-menu-divider" aria-hidden="true" />;
}

export default function OverflowMenu({
  label,
  panelClassName,
  renderTrigger,
  children,
}: {
  label: string;
  panelClassName?: string;
  renderTrigger: (args: OverflowMenuTriggerRenderArgs) => ReactNode;
  children: (args: OverflowMenuChildrenRenderArgs) => ReactNode;
}) {
  const menuId = useId();
  const instanceId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [shouldRenderPanel, setShouldRenderPanel] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({
    visibility: "hidden",
  });

  function closeMenu(options?: { restoreFocus?: boolean }) {
    setIsOpen(false);
    if (options?.restoreFocus) {
      window.requestAnimationFrame(() => {
        triggerRef.current?.focus();
      });
    }
  }

  useEffect(() => {
    function handleAnotherMenuOpening(event: Event) {
      const detail = (event as OverflowMenuOpenEvent).detail;
      if (!detail || detail.id === instanceId) {
        return;
      }

      setIsOpen(false);
    }

    document.addEventListener(MENU_OPEN_EVENT, handleAnotherMenuOpening);
    return () =>
      document.removeEventListener(MENU_OPEN_EVENT, handleAnotherMenuOpening);
  }, [instanceId]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    document.dispatchEvent(
      new CustomEvent(MENU_OPEN_EVENT, {
        detail: { id: instanceId },
      }),
    );
  }, [instanceId, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }

      closeMenu();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    function updatePosition() {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) {
        return;
      }

      const triggerRect = trigger.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const panelWidth = panelRect.width;
      const panelHeight = panelRect.height;
      const spaceBelow = window.innerHeight - triggerRect.bottom;
      const spaceAbove = triggerRect.top;
      const shouldOpenAbove =
        spaceBelow < panelHeight + PANEL_GAP && spaceAbove > spaceBelow;
      const unclampedLeft = triggerRect.right - panelWidth;
      const maxLeft = Math.max(
        VIEWPORT_PADDING,
        window.innerWidth - VIEWPORT_PADDING - panelWidth,
      );
      const left = Math.min(
        Math.max(unclampedLeft, VIEWPORT_PADDING),
        maxLeft,
      );
      const top = shouldOpenAbove
        ? Math.max(VIEWPORT_PADDING, triggerRect.top - panelHeight - PANEL_GAP)
        : Math.min(
            window.innerHeight - VIEWPORT_PADDING - panelHeight,
            triggerRect.bottom + PANEL_GAP,
          );

      setPanelStyle({
        position: "fixed",
        top,
        left,
        visibility: "visible",
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) {
        return;
      }

      getEnabledMenuItems(panel)[0]?.focus();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [isOpen]);

  function handlePanelKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const panel = panelRef.current;
    if (!panel) {
      return;
    }

    const enabledItems = getEnabledMenuItems(panel);
    if (enabledItems.length === 0) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu({ restoreFocus: true });
      }
      return;
    }

    const activeIndex = enabledItems.findIndex(
      (item) => item === document.activeElement,
    );

    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu({ restoreFocus: true });
      return;
    }

    if (event.key === "Tab") {
      closeMenu();
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      enabledItems[0]?.focus();
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      enabledItems[enabledItems.length - 1]?.focus();
      return;
    }

    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }

    event.preventDefault();

    const direction = event.key === "ArrowDown" ? 1 : -1;
    const startingIndex =
      activeIndex === -1
        ? direction === 1
          ? -1
          : 0
        : activeIndex;
    const nextIndex =
      (startingIndex + direction + enabledItems.length) % enabledItems.length;
    enabledItems[nextIndex]?.focus();
  }

  const trigger = renderTrigger({
    isOpen,
    triggerRef,
    triggerProps: {
      type: "button",
      "aria-haspopup": "menu",
      "aria-expanded": isOpen,
      "aria-controls": menuId,
      onClick: () =>
        setIsOpen((current) => {
          const nextIsOpen = !current;
          if (nextIsOpen) {
            setShouldRenderPanel(true);
          }
          return nextIsOpen;
        }),
    },
  });

  return (
    <>
      {trigger}
      {shouldRenderPanel && typeof document !== "undefined"
        ? createPortal(
            <div
              id={menuId}
              ref={panelRef}
              role="menu"
              aria-label={label}
              className={`overflow-menu-panel${panelClassName ? ` ${panelClassName}` : ""}`}
              style={
                isOpen
                  ? panelStyle
                  : {
                      ...panelStyle,
                      display: "none",
                    }
              }
              onKeyDown={handlePanelKeyDown}
            >
              {children({ closeMenu })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
