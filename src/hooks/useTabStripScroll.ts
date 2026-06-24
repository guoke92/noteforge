import {
  type RefObject,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type WheelEvent,
} from "react";

const SCROLL_STEP = 160;
/** Matches NewTabButton `w-8` */
const PLUS_BUTTON_WIDTH = 32;

function measureTabsContentWidth(tabRefs: Map<string, HTMLDivElement>): number {
  let width = 0;
  for (const el of tabRefs.values()) {
    width += el.offsetWidth;
  }
  return width;
}

/**
 * Overflow is decided against the full tab-strip budget (bar width minus the
 * permanent right toolbar), NOT the scroll viewport width. That way closing tabs
 * can dismiss scroll chrome even when tabs still exceed the narrower scroll area.
 */
export function useTabStripScroll(
  activeTabId: string | undefined,
  tabCount: number,
  barRef: RefObject<HTMLElement | null>,
  toolbarRef: RefObject<HTMLElement | null>,
  sessionRestored = false,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<string, HTMLDivElement>());
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [needsScroll, setNeedsScroll] = useState(false);

  const updateScrollState = useCallback(() => {
    const scrollEl = scrollRef.current;
    const barEl = barRef.current;
    if (!scrollEl || !barEl) return;

    const toolbarWidth = toolbarRef.current?.offsetWidth ?? 0;
    const stripBudget = barEl.clientWidth - toolbarWidth;

    const tabsWidth = measureTabsContentWidth(tabRefs.current);
    const contentWidth = tabCount === 0 ? PLUS_BUTTON_WIDTH : tabsWidth + PLUS_BUTTON_WIDTH;
    const overflow = contentWidth > stripBudget + 1;

    setNeedsScroll(overflow);

    if (!overflow) {
      if (scrollEl.scrollLeft !== 0) {
        scrollEl.scrollLeft = 0;
      }
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }

    const { scrollLeft, scrollWidth, clientWidth } = scrollEl;
    setCanScrollLeft(scrollLeft > 1);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
  }, [barRef, toolbarRef, tabCount]);

  useLayoutEffect(() => {
    updateScrollState();
    const scrollEl = scrollRef.current;
    const barEl = barRef.current;
    if (!scrollEl) return;

    scrollEl.addEventListener("scroll", updateScrollState, { passive: true });
    let rafId = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateScrollState);
    });
    ro.observe(scrollEl);
    if (barEl) ro.observe(barEl);
    const toolbarEl = toolbarRef.current;
    if (toolbarEl) ro.observe(toolbarEl);
    for (const child of scrollEl.children) {
      ro.observe(child);
    }
    return () => {
      cancelAnimationFrame(rafId);
      scrollEl.removeEventListener("scroll", updateScrollState);
      ro.disconnect();
    };
  }, [updateScrollState, tabCount, barRef, toolbarRef]);

  useLayoutEffect(() => {
    if (!activeTabId) return;
    const scrollToActive = (behavior: ScrollBehavior = "smooth") => {
      const tabEl = tabRefs.current.get(activeTabId);
      tabEl?.scrollIntoView({ inline: "nearest", block: "nearest", behavior });
      updateScrollState();
    };
    scrollToActive();
    const t = window.setTimeout(() => scrollToActive(), 200);
    return () => window.clearTimeout(t);
  }, [activeTabId, tabCount, updateScrollState]);

  useLayoutEffect(() => {
    if (!sessionRestored || !activeTabId) return;
    const scrollToActive = () => {
      const tabEl = tabRefs.current.get(activeTabId);
      tabEl?.scrollIntoView({ inline: "start", block: "nearest", behavior: "auto" });
      updateScrollState();
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(scrollToActive);
    });
    const t1 = window.setTimeout(scrollToActive, 100);
    const t2 = window.setTimeout(scrollToActive, 400);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [sessionRestored, activeTabId, tabCount, updateScrollState]);

  const scrollBy = useCallback((delta: number) => {
    scrollRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  }, []);

  const registerTabRef = useCallback(
    (id: string, el: HTMLDivElement | null) => {
      if (el) tabRefs.current.set(id, el);
      else tabRefs.current.delete(id);
      queueMicrotask(updateScrollState);
    },
    [updateScrollState],
  );

  const scrollLeft = useCallback(() => scrollBy(-SCROLL_STEP), [scrollBy]);
  const scrollRight = useCallback(() => scrollBy(SCROLL_STEP), [scrollBy]);

  const onWheel = useCallback(
    (e: WheelEvent) => {
      const el = scrollRef.current;
      if (!el || !needsScroll) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      el.scrollBy({ left: e.deltaY, behavior: "auto" });
      e.preventDefault();
    },
    [needsScroll],
  );

  return {
    scrollRef: scrollRef as RefObject<HTMLDivElement>,
    registerTabRef,
    canScrollLeft,
    canScrollRight,
    needsScroll,
    scrollLeft,
    scrollRight,
    onWheel,
    updateScrollState,
  };
}
