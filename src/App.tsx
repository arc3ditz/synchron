import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import "./index.css";
import "./App.css";
import "./components/Sidebar.css";
import "./components/Toolbar.css";
import "./components/ContentCanvas.css";
import "./components/Overlays.css";
import "./components/Projects.css";
import { ContentCanvas } from "./components/ContentCanvas";
import { Sidebar } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import { useTheme } from "./hooks/useTheme";
import { useActions } from "./hooks/useActions";
import { useProjects } from "./hooks/useProjects";
import { SECTIONS, type SectionId } from "./sections";

const SIDEBAR_DEFAULT_WIDTH = 240;
const SIDEBAR_MIN_WIDTH = 208;
const SIDEBAR_MAX_WIDTH = 360;
const SIDEBAR_KEY = "synchron.sidebar-width";
const SIDEBAR_STEP = 16;

function readSidebarWidth(): number {
  try {
    const stored = Number(window.localStorage.getItem(SIDEBAR_KEY));
    return Number.isFinite(stored) && stored >= SIDEBAR_MIN_WIDTH && stored <= SIDEBAR_MAX_WIDTH
      ? Math.round(stored)
      : SIDEBAR_DEFAULT_WIDTH;
  } catch {
    return SIDEBAR_DEFAULT_WIDTH;
  }
}

function formatToday(): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}

function App() {
  const [activeId, setActiveId] = useState<SectionId>("today");
  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const { preference, resolved, cyclePreference } = useTheme();
  // Projects own their timestamps, so they are created before actions and hand
  // their activity recorder to the action store.
  const projects = useProjects();
  const actions = useActions({ onProjectActivity: projects.recordProjectActivity });
  const dateLabel = useMemo(formatToday, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_KEY, String(sidebarWidth));
    } catch {
      // Storage can be unavailable in private or restricted webviews.
    }
  }, [sidebarWidth]);

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
      document.body.classList.remove("is-resizing-sidebar");
    };
  }, []);

  const updateSidebarWidth = useCallback((nextWidth: number) => {
    setSidebarWidth(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(nextWidth))));
  }, []);

  const handleResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;

      const handle = event.currentTarget;
      const startX = event.clientX;
      const startWidth = sidebarWidth;

      handle.setPointerCapture(event.pointerId);
      handle.classList.add("is-dragging");
      document.body.classList.add("is-resizing-sidebar");

      const stopDragging = () => {
        if (handle.hasPointerCapture(event.pointerId)) {
          handle.releasePointerCapture(event.pointerId);
        }
        handle.classList.remove("is-dragging");
        document.body.classList.remove("is-resizing-sidebar");
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", stopDragging);
        handle.removeEventListener("pointercancel", stopDragging);
        dragCleanupRef.current = null;
      };

      const move = (moveEvent: globalThis.PointerEvent) => {
        updateSidebarWidth(startWidth + moveEvent.clientX - startX);
      };

      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", stopDragging);
      handle.addEventListener("pointercancel", stopDragging);
      dragCleanupRef.current = stopDragging;
    },
    [sidebarWidth, updateSidebarWidth],
  );

  const handleResizeKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const adjustment = event.shiftKey ? SIDEBAR_STEP * 4 : SIDEBAR_STEP;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        updateSidebarWidth(sidebarWidth - adjustment);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        updateSidebarWidth(sidebarWidth + adjustment);
      } else if (event.key === "Home") {
        event.preventDefault();
        updateSidebarWidth(SIDEBAR_MIN_WIDTH);
      } else if (event.key === "End") {
        event.preventDefault();
        updateSidebarWidth(SIDEBAR_MAX_WIDTH);
      }
    },
    [sidebarWidth, updateSidebarWidth],
  );

  const activeSection =
    SECTIONS.find((section) => section.id === activeId) ?? SECTIONS[0];

  return (
    <div className="app" style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <Sidebar
        sections={SECTIONS}
        activeId={activeId}
        onSelect={setActiveId}
      />

      <div
        className="sidebar-resize-handle"
        role="separator"
        aria-label="Resize sidebar"
        aria-orientation="vertical"
        aria-valuemin={SIDEBAR_MIN_WIDTH}
        aria-valuemax={SIDEBAR_MAX_WIDTH}
        aria-valuenow={sidebarWidth}
        tabIndex={0}
        onPointerDown={handleResizePointerDown}
        onKeyDown={handleResizeKeyDown}
      />

      <div className="app__main" id="main-content">
        <Toolbar
          dateLabel={dateLabel}
          preference={preference}
          resolved={resolved}
          onCyclePreference={cyclePreference}
        />
        <ContentCanvas section={activeSection} actions={actions} projects={projects} />
      </div>
    </div>
  );
}

export default App;
