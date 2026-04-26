import { createPortal } from "react-dom";
import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((element) => !element.hasAttribute("disabled"));
}

export default function Modal({
  children,
  open,
  onClose,
  title,
}: {
  children: ReactNode;
  open: boolean;
  onClose: () => void;
  title: string;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const frameId = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog) {
        return;
      }

      const [firstFocusable] = getFocusableElements(dialog);
      (firstFocusable ?? dialog).focus();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    const focusableElements = getFocusableElements(dialog);
    if (focusableElements.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];
    const activeElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    if (
      event.shiftKey &&
      (activeElement === firstFocusable || activeElement === dialog)
    ) {
      event.preventDefault();
      lastFocusable.focus();
      return;
    }

    if (!event.shiftKey && activeElement === lastFocusable) {
      event.preventDefault();
      firstFocusable.focus();
    }
  }

  if (!open) return null;

  const modalContent = (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 99999,
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className="glass-card"
        style={{
          width: "100%",
          maxWidth: "500px",
          maxHeight: "85vh",
          position: "relative",
          outline: "none",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg-modal)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden", // Important: clip children to the supercircle radius
          border: "1px solid var(--border-glass-strong)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
        }}
      >
        {/* Close Button - remains fixed at the top right of the modal frame */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          style={{
            position: "absolute",
            top: "24px",
            right: "24px",
            zIndex: 10, // Ensure it's above the scrolling content
            color: "var(--text-secondary)",
            background: "var(--bg-app)", // Added slight background for visibility over content
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid var(--border-glass-strong)",
            cursor: "pointer",
            fontSize: "14px",
            transition: "all 0.2s",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.color = "var(--text-primary)";
            e.currentTarget.style.background = "var(--bg-card-hover)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.color = "var(--text-secondary)";
            e.currentTarget.style.background = "var(--bg-app)";
          }}
        >
          ✕
        </button>

        <div
          className="custom-scrollbar"
          style={{
            padding: "32px",
            overflowY: "auto",
            flex: 1,
          }}
        >
          <div style={{ marginBottom: "24px", paddingRight: "40px" }}>
            <h2
              id={titleId}
              style={{
                fontSize: "22px",
                fontWeight: 700,
                color: "var(--text-primary)",
                letterSpacing: "-0.01em",
              }}
            >
              {title}
            </h2>
          </div>
          {children}
        </div>
      </div>
    </div>
  );

  if (typeof document !== "undefined") {
    return createPortal(modalContent, document.body);
  }

  return null;
}
