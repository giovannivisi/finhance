"use client";

import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import type { PickerOption } from "@lib/currency-ui";

const VIEWPORT_PADDING = 16;
const PANEL_GAP = 8;

const supportsPopover =
  typeof HTMLElement !== "undefined" &&
  typeof HTMLElement.prototype.showPopover === "function";

export default function SearchablePicker({
  id,
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder = "Search…",
  emptyMessage = "No matches found.",
  disabled = false,
  allowClear = false,
  clearLabel = "Clear selection",
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: PickerOption[];
  placeholder: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  allowClear?: boolean;
  clearLabel?: string;
}) {
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedOption =
    options.find((option) => option.value === value) ?? null;
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return options;
    }

    return options.filter((option) =>
      option.searchText.includes(normalizedQuery),
    );
  }, [options, query]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    const triggerRect = trigger.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const panelWidth = Math.max(panelRect.width, triggerRect.width);
    const panelHeight = panelRect.height;
    const spaceBelow = window.innerHeight - triggerRect.bottom;
    const spaceAbove = triggerRect.top;
    const shouldOpenAbove =
      spaceBelow < panelHeight + PANEL_GAP && spaceAbove > spaceBelow;
    const left = Math.min(
      Math.max(triggerRect.left, VIEWPORT_PADDING),
      window.innerWidth - VIEWPORT_PADDING - panelWidth,
    );
    const top = shouldOpenAbove
      ? Math.max(VIEWPORT_PADDING, triggerRect.top - panelHeight - PANEL_GAP)
      : Math.min(
          window.innerHeight - VIEWPORT_PADDING - panelHeight,
          triggerRect.bottom + PANEL_GAP,
        );

    panel.style.position = "fixed";
    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;
    panel.style.minWidth = `${triggerRect.width}px`;
  }, []);

  // Focus search input when opened
  useEffect(() => {
    if (!isOpen) return;

    const frameId = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [isOpen]);

  // Open / close the popover and wire up positioning
  useEffect(() => {
    if (!isOpen || !supportsPopover) return;

    const panel = panelRef.current;
    if (!panel) return;

    try {
      panel.showPopover();
    } catch {
      // Ignore if already showing
    }

    requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      try {
        panel.hidePopover();
      } catch {
        // Ignore if already hidden
      }
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  // Reposition when filtered options change (panel height changes)
  useEffect(() => {
    if (!isOpen || !supportsPopover) return;
    requestAnimationFrame(updatePosition);
  }, [isOpen, filteredOptions.length, updatePosition]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;

      if (
        triggerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }

      setIsOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  function open() {
    if (!disabled) {
      setIsOpen((current) => !current);
    }
  }

  function close() {
    setIsOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;

    if (
      event.key === "ArrowDown" ||
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();
      setIsOpen(true);
    }
  }

  function handlePanelKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  function handleSelect(nextValue: string) {
    onChange(nextValue);
    close();
  }

  const panelContent = (
    <div
      id={panelId}
      ref={panelRef}
      role="listbox"
      {...(supportsPopover ? { popover: "manual" } : {})}
      className="searchable-picker-panel"
      onKeyDown={handlePanelKeyDown}
    >
      <div className="searchable-picker-search-row">
        <Search size={16} className="searchable-picker-search-icon" />
        <input
          ref={searchInputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchPlaceholder}
          className="searchable-picker-search"
        />
      </div>

      <div className="searchable-picker-options">
        {allowClear ? (
          <button
            type="button"
            className="searchable-picker-option is-clear"
            onClick={() => handleSelect("")}
          >
            <span className="searchable-picker-clear-icon">
              <X size={14} />
            </span>
            <span className="searchable-picker-option-copy">
              <span className="searchable-picker-option-label">
                {clearLabel}
              </span>
            </span>
          </button>
        ) : null}

        {filteredOptions.length === 0 ? (
          <div className="searchable-picker-empty">{emptyMessage}</div>
        ) : (
          filteredOptions.map((option) => (
            <button
              key={`${option.value}::${option.label}`}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className="searchable-picker-option"
              onClick={() => handleSelect(option.value)}
            >
              <PickerValue option={option} />
              {option.value === value ? (
                <Check size={16} className="searchable-picker-check" />
              ) : null}
            </button>
          ))
        )}
      </div>
    </div>
  );

  return (
    <>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        className={`searchable-picker-trigger${disabled ? " is-disabled" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        onClick={open}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      >
        {selectedOption ? (
          <PickerValue option={selectedOption} />
        ) : (
          <span className="searchable-picker-placeholder">{placeholder}</span>
        )}
        <ChevronDown
          size={16}
          className={`searchable-picker-chevron${isOpen ? " is-open" : ""}`}
        />
      </button>

      {supportsPopover
        ? /* Always in DOM; visibility controlled by showPopover/hidePopover */
          panelContent
        : /* Fallback for jsdom / older browsers: portal when open */
          isOpen && typeof document !== "undefined"
          ? createPortal(panelContent, document.body)
          : null}
    </>
  );
}

function PickerValue({ option }: { option: PickerOption }) {
  return (
    <span className="searchable-picker-value">
      {option.prefix ? (
        <span className="searchable-picker-prefix" aria-hidden="true">
          {option.prefix}
        </span>
      ) : null}
      {option.badge ? (
        <span className="searchable-picker-badge">{option.badge}</span>
      ) : null}
      <span className="searchable-picker-option-copy">
        <span className="searchable-picker-option-label">{option.label}</span>
        {option.meta ? (
          <span className="searchable-picker-option-meta">{option.meta}</span>
        ) : null}
      </span>
    </span>
  );
}
