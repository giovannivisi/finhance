"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  motion,
  AnimatePresence,
  useReducedMotion,
  useAnimation,
} from "framer-motion";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  History,
  MoreHorizontal,
  TrendingUp,
  PieChart,
  Repeat,
  ClipboardCheck,
  Tag,
  Upload,
  Sun,
  Moon,
} from "lucide-react";
import { useTheme } from "@components/ThemeProvider";
import { useRouter } from "next/navigation";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Activity", icon: ArrowLeftRight },
  { href: "/accounts", label: "Wallets", icon: Wallet },
  { href: "/history", label: "History", icon: History },
] as const;

const MORE_ITEMS = [
  { href: "/analytics", label: "Analytics", icon: TrendingUp },
  { href: "/budgets", label: "Budgets", icon: PieChart },
  { href: "/recurring", label: "Recurring", icon: Repeat },
  { href: "/review", label: "Review", icon: ClipboardCheck },
  { href: "/categories", label: "Categories", icon: Tag },
  { href: "/import", label: "Import", icon: Upload },
] as const;

const TAB_COUNT = NAV_ITEMS.length + 1; // 4 nav + 1 more

export default function TabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<{
    href: string;
    index: number;
  } | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [hoverLeftPct, setHoverLeftPct] = useState<number | null>(null);
  const [dragLeftPct, setDragLeftPct] = useState<number | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const menuRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const isDraggingRef = useRef(false);
  const wasDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);

  const pillControls = useAnimation();
  const prevPillMetricsRef = useRef<{ left: number; width: number } | null>(
    null,
  );
  const animationRunIdRef = useRef(0);

  /** Returns the tab slot index (0–TAB_COUNT-1) for a given clientX. */
  function getTabIndexAt(clientX: number): number {
    const bar = barRef.current;
    if (!bar) return 0;
    const rect = bar.getBoundingClientRect();
    const x = clientX - rect.left;
    const idx = Math.floor((x / rect.width) * TAB_COUNT);
    return Math.max(0, Math.min(idx, TAB_COUNT - 1));
  }

  function getDragLeftPctAt(clientX: number): number {
    const bar = barRef.current;
    if (!bar) return 0;
    const rect = bar.getBoundingClientRect();
    const slotWidthPct = 100 / TAB_COUNT;
    const dragWidthPct = Math.min(slotWidthPct * 1.08, slotWidthPct + 2.5);
    const x = clientX - rect.left;
    const unclamped = (x / rect.width) * 100 - dragWidthPct / 2;
    return Math.max(0, Math.min(unclamped, 100 - dragWidthPct));
  }

  function getHoverLeftPctAt(clientX: number): number {
    const bar = barRef.current;
    if (!bar) return 0;
    const rect = bar.getBoundingClientRect();
    const slotWidthPct = 100 / TAB_COUNT;
    const x = clientX - rect.left;
    const unclamped = (x / rect.width) * 100 - slotWidthPct / 2;
    return Math.max(0, Math.min(unclamped, 100 - slotWidthPct));
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    isDraggingRef.current = false;
    wasDraggingRef.current = false;
    dragStartXRef.current = e.clientX;
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!(e.buttons & 1)) return;
    const delta = e.clientX - dragStartXRef.current;
    if (Math.abs(delta) < 6) return;

    if (!isDraggingRef.current) {
      isDraggingRef.current = true;
      setShowMore(false);
      setHoverLeftPct(null);
    }
    setHoveredIndex(getTabIndexAt(e.clientX));
    setDragLeftPct(getDragLeftPctAt(e.clientX));
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    if (!isDraggingRef.current) return;

    wasDraggingRef.current = true;
    isDraggingRef.current = false;
    setDragLeftPct(null);
    setHoverLeftPct(null);

    const idx = getTabIndexAt(e.clientX);
    setHoveredIndex(null);

    if (idx < NAV_ITEMS.length) {
      setPendingNavigation({ href: NAV_ITEMS[idx].href, index: idx });
      router.push(NAV_ITEMS[idx].href);
    } else {
      setShowMore(true);
    }
  }

  function handlePointerCancel() {
    isDraggingRef.current = false;
    setDragLeftPct(null);
    setHoverLeftPct(null);
    setHoveredIndex(null);
  }

  /** Intercepts the synthetic click that fires after a drag-release. */
  function handleClickCapture(e: React.MouseEvent) {
    if (wasDraggingRef.current) {
      wasDraggingRef.current = false;
      e.stopPropagation();
      e.preventDefault();
    }
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMore(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowMore(false);
        moreButtonRef.current?.focus();
      }
    }

    if (showMore) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showMore]);

  const activeIndex = NAV_ITEMS.findIndex((item) =>
    item.href === "/" ? pathname === "/" : pathname?.startsWith(item.href),
  );

  const activeSlotIndex = activeIndex !== -1 ? activeIndex : NAV_ITEMS.length;
  const pendingIndex =
    pendingNavigation === null
      ? null
      : pendingNavigation.href === "/"
        ? pathname !== "/"
          ? pendingNavigation.index
          : null
        : pathname?.startsWith(pendingNavigation.href)
          ? null
          : pendingNavigation.index;
  const visualActiveIndex = showMore
    ? NAV_ITEMS.length
    : (pendingIndex ?? activeSlotIndex);
  const pillIndex =
    hoveredIndex !== null
      ? hoveredIndex
      : showMore
        ? NAV_ITEMS.length
        : (pendingIndex ?? activeSlotIndex);

  useEffect(() => {
    const slotWidthPct = 100 / TAB_COUNT;
    const dragWidthPct = Math.min(slotWidthPct * 1.08, slotWidthPct + 2.5);
    const hoverWidthPct = slotWidthPct * 1.01;
    const targetWidthPct =
      dragLeftPct !== null
        ? dragWidthPct
        : hoverLeftPct !== null
          ? hoverWidthPct
          : slotWidthPct;
    const targetLeftPct =
      dragLeftPct !== null
        ? dragLeftPct
        : hoverLeftPct !== null
          ? hoverLeftPct
          : pillIndex * slotWidthPct;
    const previous = prevPillMetricsRef.current;
    const runId = animationRunIdRef.current + 1;
    animationRunIdRef.current = runId;
    pillControls.stop();

    if (previous === null) {
      prevPillMetricsRef.current = {
        left: targetLeftPct,
        width: targetWidthPct,
      };
      void pillControls.set({
        left: `${targetLeftPct}%`,
        width: `${targetWidthPct}%`,
      });
      return;
    }

    if (previous.left === targetLeftPct && previous.width === targetWidthPct) {
      return;
    }

    prevPillMetricsRef.current = {
      left: targetLeftPct,
      width: targetWidthPct,
    };

    if (prefersReducedMotion) {
      void pillControls.start({
        left: `${targetLeftPct}%`,
        width: `${targetWidthPct}%`,
        transition: { duration: 0 },
      });
      return;
    }

    if (dragLeftPct !== null) {
      void pillControls.set({
        left: `${targetLeftPct}%`,
        width: `${targetWidthPct}%`,
      });
      return;
    }

    const isRight = targetLeftPct > previous.left;
    const distanceInSlots =
      Math.abs(targetLeftPct - previous.left) / slotWidthPct;
    const extraWidthPct = Math.min(distanceInSlots, 2) * slotWidthPct * 0.7;
    const stretchLeftPct = isRight ? previous.left : targetLeftPct;
    const stretchWidthPct = Math.max(
      targetWidthPct,
      slotWidthPct + extraWidthPct,
    );

    void (async () => {
      await pillControls.start({
        left: `${stretchLeftPct}%`,
        width: `${stretchWidthPct}%`,
        transition: {
          type: "tween",
          duration: 0.15,
          ease: [0.22, 1, 0.36, 1],
        },
      });
      if (animationRunIdRef.current !== runId) {
        return;
      }
      await pillControls.start({
        left: `${targetLeftPct}%`,
        width: `${targetWidthPct}%`,
        transition: {
          type: "spring",
          stiffness: 360,
          damping: 28,
          mass: 0.72,
        },
      });
    })();
  }, [
    dragLeftPct,
    hoverLeftPct,
    pillControls,
    pillIndex,
    prefersReducedMotion,
  ]);

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-10 left-0 right-0 z-50 pointer-events-none flex justify-center"
    >
      <div ref={menuRef} className="pointer-events-auto relative">
        <AnimatePresence>
          {showMore && (
            <motion.div
              id="revolut-more-panel"
              aria-label="More navigation"
              initial={
                prefersReducedMotion
                  ? false
                  : { opacity: 0, y: 15, scale: 0.95 }
              }
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={
                prefersReducedMotion
                  ? { opacity: 0 }
                  : { opacity: 0, y: 15, scale: 0.95 }
              }
              transition={
                prefersReducedMotion
                  ? { duration: 0 }
                  : { type: "spring", damping: 25, stiffness: 400 }
              }
              className="tab-more-panel absolute bottom-full mb-5 right-0 w-[196px] px-1.5 py-1.5 flex flex-col gap-0 overflow-visible"
            >
              {MORE_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => {
                    setPendingNavigation({
                      href: item.href,
                      index: NAV_ITEMS.length,
                    });
                    setShowMore(false);
                  }}
                  aria-current={
                    pathname?.startsWith(item.href) ? "page" : undefined
                  }
                  className="group flex min-h-[38px] items-center gap-3 rounded-xl px-3 py-2 transition-all hover:bg-[var(--tab-bg-highlight)]"
                >
                  <item.icon
                    size={18}
                    aria-hidden="true"
                    className="tab-menu-icon"
                  />
                  <span className="tab-menu-label text-[13px] font-medium leading-none">
                    {item.label}
                  </span>
                </Link>
              ))}

              <div
                className="mx-2 my-0.5 h-px bg-[var(--tab-border)]"
                style={{ opacity: 0.5 }}
                aria-hidden="true"
              />

              <button
                type="button"
                onClick={() => toggleTheme()}
                aria-label={
                  theme === "dark"
                    ? "Switch to light mode"
                    : "Switch to dark mode"
                }
                className="group flex min-h-[38px] items-center gap-3 rounded-xl px-3 py-2 transition-all hover:bg-[var(--tab-bg-highlight)]"
                style={{ width: "100%", textAlign: "left" }}
              >
                {theme === "dark" ? (
                  <Sun size={18} aria-hidden="true" className="tab-menu-icon" />
                ) : (
                  <Moon
                    size={18}
                    aria-hidden="true"
                    className="tab-menu-icon"
                  />
                )}
                <span className="tab-menu-label text-[13px] font-medium leading-none">
                  {theme === "dark" ? "Light Mode" : "Dark Mode"}
                </span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div
          ref={barRef}
          id="revolut-tabbar"
          className="tab-bar-pill relative flex items-center p-2 gap-1 cursor-grab active:cursor-grabbing select-none"
          style={{ touchAction: "none" }}
          onMouseMove={(e) => {
            if (isDraggingRef.current || e.buttons & 1) {
              return;
            }
            setHoveredIndex(getTabIndexAt(e.clientX));
            setHoverLeftPct(getHoverLeftPctAt(e.clientX));
          }}
          onMouseLeave={() => {
            if (!isDraggingRef.current) {
              setHoveredIndex(null);
              setHoverLeftPct(null);
            }
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onClickCapture={handleClickCapture}
        >
          <div className="absolute inset-2 flex pointer-events-none">
            <motion.div
              aria-hidden="true"
              className="absolute h-full rounded-full tab-active-pill overflow-hidden"
              animate={pillControls}
            >
              <div className="absolute inset-0 pill-sheen pointer-events-none" />
            </motion.div>
          </div>

          {NAV_ITEMS.map((item, idx) => {
            const isActive = activeIndex === idx;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                onClick={() => {
                  setPendingNavigation({ href: item.href, index: idx });
                  setShowMore(false);
                  setHoverLeftPct(null);
                }}
                onMouseEnter={(e) => {
                  setHoveredIndex(idx);
                  setHoverLeftPct(getHoverLeftPctAt(e.clientX));
                }}
                className={cn(
                  "relative flex items-center justify-center w-14 h-14 rounded-full transition-all active:scale-90",
                  visualActiveIndex === idx
                    ? "text-[var(--tab-icon-active)]"
                    : "text-[var(--tab-icon-inactive)] hover:text-[var(--tab-icon-hover)]",
                )}
              >
                <item.icon
                  size={22}
                  strokeWidth={visualActiveIndex === idx ? 2.5 : 2}
                  aria-hidden="true"
                />
                {visualActiveIndex === idx && (
                  <motion.div
                    layoutId="active-dot"
                    aria-hidden="true"
                    transition={
                      prefersReducedMotion ? { duration: 0 } : undefined
                    }
                    className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full shadow-[0_0_12px_rgba(16,185,129,0.8)]"
                  />
                )}
              </Link>
            );
          })}

          <button
            ref={moreButtonRef}
            type="button"
            onClick={() => {
              setShowMore((current) => !current);
              setHoverLeftPct(null);
            }}
            onMouseEnter={(e) => {
              setHoveredIndex(NAV_ITEMS.length);
              setHoverLeftPct(getHoverLeftPctAt(e.clientX));
            }}
            aria-label="More navigation"
            aria-expanded={showMore}
            aria-haspopup="true"
            aria-controls="revolut-more-panel"
            className={cn(
              "tab-more-btn relative flex items-center justify-center w-14 h-14 rounded-full transition-all active:scale-90",
              (showMore || visualActiveIndex === NAV_ITEMS.length) && "is-open",
            )}
          >
            <MoreHorizontal
              size={22}
              strokeWidth={
                showMore || visualActiveIndex === NAV_ITEMS.length ? 2.5 : 2
              }
              aria-hidden="true"
            />
            {visualActiveIndex === NAV_ITEMS.length && (
              <motion.div
                layoutId="active-dot"
                aria-hidden="true"
                transition={prefersReducedMotion ? { duration: 0 } : undefined}
                className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full shadow-[0_0_12px_rgba(16,185,129,0.8)]"
              />
            )}
          </button>
        </div>
      </div>
    </nav>
  );
}
