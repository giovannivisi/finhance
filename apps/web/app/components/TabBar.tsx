"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AnimatePresence,
  motion,
  useAnimation,
  useReducedMotion,
} from "framer-motion";
import { MoreHorizontal } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useTheme } from "@components/ThemeProvider";
import {
  PRIMARY_NAV_ITEMS,
  SECONDARY_NAV_ITEMS,
  isActivePath,
  isRedundantTabNavigation,
} from "@lib/navigation";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const TAB_COUNT = PRIMARY_NAV_ITEMS.length + 1;

export default function TabBar() {
  const pathname = usePathname();
  const router = useRouter();
  useTheme();
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [hoverLeftPct, setHoverLeftPct] = useState<number | null>(null);
  const [dragLeftPct, setDragLeftPct] = useState<number | null>(null);
  const [isPointerTracking, setIsPointerTracking] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const menuRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const isDraggingRef = useRef(false);
  const wasDraggingRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const dragStartXRef = useRef(0);
  const dragStartYRef = useRef(0);
  const pillControls = useAnimation();
  const prevPillMetricsRef = useRef<{ left: number; width: number } | null>(
    null,
  );
  const animationRunIdRef = useRef(0);

  const currentPath = pathname ?? "/";
  const activePendingPath =
    pendingPath && !isActivePath(currentPath, pendingPath) ? pendingPath : null;
  const activePrimaryIndex = PRIMARY_NAV_ITEMS.findIndex((item) =>
    isActivePath(currentPath, item.href),
  );
  const moreIsActive =
    activePrimaryIndex === -1 ||
    SECONDARY_NAV_ITEMS.some((item) => isActivePath(currentPath, item.href)) ||
    isActivePath(currentPath, "/privacy");
  const activeSlotIndex =
    activePrimaryIndex === -1 ? PRIMARY_NAV_ITEMS.length : activePrimaryIndex;
  const pendingPrimaryIndex = activePendingPath
    ? PRIMARY_NAV_ITEMS.findIndex((item) =>
        isActivePath(activePendingPath, item.href),
      )
    : -1;
  const pendingSlotIndex =
    activePendingPath === null
      ? null
      : pendingPrimaryIndex === -1
        ? PRIMARY_NAV_ITEMS.length
        : pendingPrimaryIndex;
  const visualActiveIndex = showMore
    ? PRIMARY_NAV_ITEMS.length
    : (pendingSlotIndex ?? activeSlotIndex);
  const pillIndex = hoveredIndex ?? visualActiveIndex;

  const getTabIndexAt = useCallback((clientX: number) => {
    const bar = barRef.current;
    if (!bar) {
      return 0;
    }

    const rect = bar.getBoundingClientRect();
    const x = clientX - rect.left;
    const index = Math.floor((x / rect.width) * TAB_COUNT);
    return Math.max(0, Math.min(index, TAB_COUNT - 1));
  }, []);

  const getDragLeftPctAt = useCallback((clientX: number) => {
    const bar = barRef.current;
    if (!bar) {
      return 0;
    }

    const rect = bar.getBoundingClientRect();
    const slotWidthPct = 100 / TAB_COUNT;
    const x = clientX - rect.left;
    const unclamped = (x / rect.width) * 100 - slotWidthPct / 2;
    return Math.max(0, Math.min(unclamped, 100 - slotWidthPct));
  }, []);

  const getHoverLeftPctAt = useCallback((clientX: number) => {
    const bar = barRef.current;
    if (!bar) {
      return 0;
    }

    const rect = bar.getBoundingClientRect();
    const slotWidthPct = 100 / TAB_COUNT;
    const x = clientX - rect.left;
    const unclamped = (x / rect.width) * 100 - slotWidthPct / 2;
    return Math.max(0, Math.min(unclamped, 100 - slotWidthPct));
  }, []);

  const handleNavigate = useCallback(
    (nextPath: string) => {
      if (
        isRedundantTabNavigation({
          currentPath,
          targetPath: nextPath,
          pendingPath: activePendingPath,
        })
      ) {
        setShowMore(false);
        return;
      }

      setPendingPath(nextPath);
      setShowMore(false);
      setHoveredIndex(null);
      setHoverLeftPct(null);
      setDragLeftPct(null);
      router.push(nextPath);
    },
    [activePendingPath, currentPath, router],
  );

  useEffect(() => {
    if (!showMore) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setShowMore(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowMore(false);
        moreButtonRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showMore]);

  useEffect(() => {
    if (!isPointerTracking) {
      return;
    }

    function handleGlobalPointerMove(event: PointerEvent) {
      if (activePointerIdRef.current !== event.pointerId) {
        return;
      }

      const deltaX = event.clientX - dragStartXRef.current;
      const deltaY = event.clientY - dragStartYRef.current;

      if (!isDraggingRef.current) {
        if (Math.abs(deltaX) < 10) {
          return;
        }

        if (Math.abs(deltaX) <= Math.abs(deltaY)) {
          return;
        }

        isDraggingRef.current = true;
        setShowMore(false);
        setHoverLeftPct(null);
      }

      if (event.cancelable) {
        event.preventDefault();
      }

      setHoveredIndex(getTabIndexAt(event.clientX));
      setDragLeftPct(getDragLeftPctAt(event.clientX));
    }

    function finishPointerTracking(event: PointerEvent) {
      if (activePointerIdRef.current !== event.pointerId) {
        return;
      }

      const wasDragging = isDraggingRef.current;
      activePointerIdRef.current = null;
      isDraggingRef.current = false;
      setDragLeftPct(null);
      setHoverLeftPct(null);
      setIsPointerTracking(false);

      if (!wasDragging) {
        return;
      }

      wasDraggingRef.current = true;
      const index = getTabIndexAt(event.clientX);
      setHoveredIndex(null);

      if (index < PRIMARY_NAV_ITEMS.length) {
        handleNavigate(PRIMARY_NAV_ITEMS[index].href);
        return;
      }

      setShowMore(true);
    }

    window.addEventListener("pointermove", handleGlobalPointerMove, {
      passive: false,
    });
    window.addEventListener("pointerup", finishPointerTracking);
    window.addEventListener("pointercancel", finishPointerTracking);

    return () => {
      window.removeEventListener("pointermove", handleGlobalPointerMove);
      window.removeEventListener("pointerup", finishPointerTracking);
      window.removeEventListener("pointercancel", finishPointerTracking);
    };
  }, [getDragLeftPctAt, getTabIndexAt, handleNavigate, isPointerTracking]);

  useEffect(() => {
    const slotWidthPct = 100 / TAB_COUNT;
    const hoverWidthPct = slotWidthPct * 1.01;
    const targetWidthPct =
      dragLeftPct !== null || hoverLeftPct !== null
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

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    activePointerIdRef.current = event.pointerId;
    isDraggingRef.current = false;
    wasDraggingRef.current = false;
    dragStartXRef.current = event.clientX;
    dragStartYRef.current = event.clientY;
    setIsPointerTracking(true);
  }

  function handleClickCapture(event: ReactMouseEvent<HTMLDivElement>) {
    if (!wasDraggingRef.current) {
      return;
    }

    wasDraggingRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <nav aria-label="Primary" className="tab-bar-nav">
      <div ref={menuRef} className="tab-bar-menu-anchor">
        <AnimatePresence>
          {showMore ? (
            <motion.div
              id="revolut-more-panel"
              aria-label="More navigation"
              initial={
                prefersReducedMotion
                  ? false
                  : { opacity: 0, y: 12, scale: 0.96 }
              }
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={
                prefersReducedMotion
                  ? { opacity: 0 }
                  : { opacity: 0, y: 12, scale: 0.96 }
              }
              transition={
                prefersReducedMotion
                  ? { duration: 0 }
                  : { type: "spring", damping: 24, stiffness: 380 }
              }
              className="tab-more-panel"
            >
              {SECONDARY_NAV_ITEMS.map((item) => {
                const isActive = isActivePath(currentPath, item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    onClick={(event) => {
                      event.preventDefault();
                      handleNavigate(item.href);
                    }}
                    aria-current={isActive ? "page" : undefined}
                    className="tab-menu-link group"
                  >
                    <item.icon
                      size={18}
                      aria-hidden="true"
                      className="tab-menu-icon"
                    />
                    <span className="tab-menu-label">{item.label}</span>
                  </Link>
                );
              })}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div
          ref={barRef}
          className="tab-bar-pill is-draggable"
          onMouseMove={(event) => {
            if (isDraggingRef.current || event.buttons & 1) {
              return;
            }

            setHoveredIndex(getTabIndexAt(event.clientX));
            setHoverLeftPct(getHoverLeftPctAt(event.clientX));
          }}
          onMouseLeave={() => {
            if (!isDraggingRef.current) {
              setHoveredIndex(null);
              setHoverLeftPct(null);
            }
          }}
          onPointerDown={handlePointerDown}
          onClickCapture={handleClickCapture}
        >
          <div aria-hidden="true" className="tab-active-pill-track">
            <motion.div className="tab-active-pill" animate={pillControls}>
              <div className="pill-sheen" />
            </motion.div>
          </div>

          {PRIMARY_NAV_ITEMS.map((item, index) => {
            const isActive = isActivePath(currentPath, item.href);
            const isBlocked = isRedundantTabNavigation({
              currentPath,
              targetPath: item.href,
              pendingPath: activePendingPath,
            });

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                draggable={false}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                aria-disabled={isBlocked}
                onClick={(event) => {
                  event.preventDefault();
                  handleNavigate(item.href);
                }}
                onMouseEnter={(event) => {
                  setHoveredIndex(index);
                  setHoverLeftPct(getHoverLeftPctAt(event.clientX));
                }}
                className={cn(
                  "tab-bar-link",
                  visualActiveIndex === index ? "is-active" : "is-inactive",
                )}
              >
                <item.icon
                  size={22}
                  strokeWidth={visualActiveIndex === index ? 2.5 : 2}
                  aria-hidden="true"
                />
              </Link>
            );
          })}

          <button
            ref={moreButtonRef}
            type="button"
            draggable={false}
            aria-label="More navigation"
            aria-expanded={showMore}
            aria-haspopup="true"
            aria-controls="revolut-more-panel"
            onClick={() => {
              setShowMore((current) => !current);
              setHoverLeftPct(null);
            }}
            onMouseEnter={(event) => {
              setHoveredIndex(PRIMARY_NAV_ITEMS.length);
              setHoverLeftPct(getHoverLeftPctAt(event.clientX));
            }}
            className={cn(
              "tab-bar-link tab-more-btn",
              showMore || moreIsActive ? "is-active" : "is-inactive",
              showMore && "is-open",
            )}
          >
            <MoreHorizontal
              size={22}
              strokeWidth={showMore || moreIsActive ? 2.5 : 2}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
    </nav>
  );
}
