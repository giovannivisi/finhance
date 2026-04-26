"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
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
  const [showMore, setShowMore] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const menuRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const isDraggingRef = useRef(false);
  const wasDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);

  /** Returns the tab slot index (0–TAB_COUNT-1) for a given clientX. */
  function getTabIndexAt(clientX: number): number {
    const bar = barRef.current;
    if (!bar) return 0;
    const rect = bar.getBoundingClientRect();
    const x = clientX - rect.left;
    const idx = Math.floor((x / rect.width) * TAB_COUNT);
    return Math.max(0, Math.min(idx, TAB_COUNT - 1));
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    isDraggingRef.current = false;
    wasDraggingRef.current = false;
    dragStartXRef.current = e.clientX;
    // No setPointerCapture — let clicks bubble naturally to <Link> children.
    // onPointerMove/Up on the container still receive events via React bubbling.
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!(e.buttons & 1)) return; // primary button must be held
    const delta = e.clientX - dragStartXRef.current;
    if (Math.abs(delta) < 6) return;

    if (!isDraggingRef.current) {
      isDraggingRef.current = true;
      setIsDragging(true);
    }
    setHoveredIndex(getTabIndexAt(e.clientX));
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    if (!isDraggingRef.current) return;

    wasDraggingRef.current = true;
    isDraggingRef.current = false;
    setIsDragging(false);

    const idx = getTabIndexAt(e.clientX);
    setHoveredIndex(null);

    if (idx < NAV_ITEMS.length) {
      router.push(NAV_ITEMS[idx].href);
    } else {
      setShowMore(true);
    }
  }

  function handlePointerCancel() {
    isDraggingRef.current = false;
    setIsDragging(false);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowMore(false);
  }, [pathname]);

  // Click outside to close "More" menu
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

  // -1 means we're on a More-menu page → park the pill at the "..." slot
  const isMoreActive = activeIndex === -1;
  const pillIndex =
    hoveredIndex !== null
      ? hoveredIndex
      : activeIndex !== -1
        ? activeIndex
        : NAV_ITEMS.length; // "..." slot

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-10 left-0 right-0 z-50 pointer-events-none flex justify-center"
    >
      <div ref={menuRef} className="pointer-events-auto relative">
        {/* More Menu Popover */}
        <AnimatePresence>
          {showMore && (
            <motion.div
              id="revolut-more-panel"
              role="menu"
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
              className="tab-more-panel absolute bottom-full mb-5 right-0 min-w-[180px] p-2 flex flex-col gap-1 overflow-hidden"
            >
              {MORE_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all hover:bg-[var(--tab-bg-highlight)] group"
                >
                  <item.icon
                    size={18}
                    aria-hidden="true"
                    className="tab-menu-icon"
                  />
                  <span className="text-[13px] font-medium tab-menu-label">
                    {item.label}
                  </span>
                </Link>
              ))}

              <div
                className="h-px bg-[var(--tab-border)] my-1 mx-2"
                style={{ opacity: 0.5 }}
                role="separator"
              />

              {/* Theme Toggle */}
              <button
                onClick={() => toggleTheme()}
                role="menuitem"
                aria-label={
                  theme === "dark"
                    ? "Switch to light mode"
                    : "Switch to dark mode"
                }
                className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[var(--tab-bg-highlight)] transition-colors group"
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
                <span className="text-[13px] font-medium tab-menu-label">
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
          onMouseLeave={() => {
            if (!isDraggingRef.current) setHoveredIndex(null);
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onClickCapture={handleClickCapture}
        >
          {/* Magic Slider Background — always rendered, parks at "..." for More pages */}
          <div className="absolute inset-2 flex pointer-events-none">
            <motion.div
              layoutId="tab-highlight"
              aria-hidden="true"
              className="absolute h-full rounded-full tab-active-pill overflow-hidden"
              initial={false}
              animate={{
                left: `${pillIndex * (100 / TAB_COUNT)}%`,
                width: `${100 / TAB_COUNT}%`,
              }}
              transition={
                prefersReducedMotion
                  ? { duration: 0 }
                  : isDragging
                    ? { type: "tween", duration: 0.05 }
                    : { type: "spring", stiffness: 450, damping: 30, mass: 0.8 }
              }
            >
              <div className="absolute inset-0 pill-sheen pointer-events-none" />
            </motion.div>
          </div>

          {/* Tab Items */}
          {NAV_ITEMS.map((item, idx) => {
            const isActive = activeIndex === idx;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                onMouseEnter={() => setHoveredIndex(idx)}
                className={cn(
                  "relative flex items-center justify-center w-14 h-14 rounded-full transition-all active:scale-90",
                  isActive
                    ? "text-[var(--tab-icon-active)]"
                    : "text-[var(--tab-icon-inactive)] hover:text-[var(--tab-icon-hover)]",
                )}
              >
                <item.icon
                  size={22}
                  strokeWidth={isActive ? 2.5 : 2}
                  aria-hidden="true"
                />
                {isActive && (
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

          {/* More Button */}
          <button
            ref={moreButtonRef}
            type="button"
            onClick={() => setShowMore(!showMore)}
            onMouseEnter={() => setHoveredIndex(NAV_ITEMS.length)}
            aria-label="More navigation"
            aria-expanded={showMore}
            aria-haspopup="menu"
            aria-controls="revolut-more-panel"
            className={cn(
              "tab-more-btn relative flex items-center justify-center w-14 h-14 rounded-full transition-all active:scale-90",
              (showMore || isMoreActive) && "is-open",
            )}
          >
            <MoreHorizontal
              size={22}
              strokeWidth={showMore || isMoreActive ? 2.5 : 2}
              aria-hidden="true"
            />
            {isMoreActive && (
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
