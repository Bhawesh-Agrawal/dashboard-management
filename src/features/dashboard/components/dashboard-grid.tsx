"use client";

import { useState, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { saveDashboardLayout } from "@/features/dashboard/lib/actions";
import type { WidgetId } from "../lib/widget-registry";
import { WIDGET_REGISTRY } from "../lib/widget-registry";

// ─── Sortable Widget Wrapper ────────────────────────────────

function SortableWidget({
  id,
  children,
  hidden,
  onToggleVisibility,
}: {
  id: WidgetId;
  children: React.ReactNode;
  hidden: boolean;
  onToggleVisibility: (id: WidgetId) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const label = WIDGET_REGISTRY[id]?.label ?? id;

  if (hidden) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="flex items-center justify-between rounded-md border border-dashed border-border bg-muted/30 px-3 py-2"
      >
        <span className="text-xs text-muted-foreground">{label} is hidden</span>
        <button
          onClick={() => onToggleVisibility(id)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title={`Show ${label}`}
        >
          <EyeOff className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative rounded-lg transition-all",
        isDragging && "opacity-50 z-50"
      )}
    >
      {/* Drag handle + visibility toggle — always visible on hover */}
      <div className="absolute -left-8 top-3 flex flex-col items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          className="touch-none rounded p-0.5 text-muted-foreground/50 hover:text-foreground cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
          title="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button
          onClick={() => onToggleVisibility(id)}
          className="rounded p-0.5 text-muted-foreground/50 hover:text-foreground"
          title={`Hide ${label}`}
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
      </div>
      {children}
    </div>
  );
}

// ─── Drag Overlay Preview ────────────────────────────────────

function DragOverlayContent({ id }: { id: WidgetId }) {
  const label = WIDGET_REGISTRY[id]?.label ?? id;
  return (
    <div className="rounded-lg border border-primary/20 bg-card p-3 shadow-lg">
      <span className="text-sm font-medium text-foreground">{label}</span>
    </div>
  );
}

// ─── Main DashboardGrid Component ───────────────────────────

export function DashboardGrid({
  mainWidgets,
  sidebarWidgets,
  hiddenWidgets,
  renderWidget,
}: {
  mainWidgets: WidgetId[];
  sidebarWidgets: WidgetId[];
  hiddenWidgets: string[];
  renderWidget: (id: WidgetId) => React.ReactNode;
}) {
  const [localHidden, setLocalHidden] = useState<Set<string>>(
    new Set(hiddenWidgets)
  );
  const [activeId, setActiveId] = useState<WidgetId | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as WidgetId);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);

      if (!over || active.id === over.id) return;

      const activeId = active.id as WidgetId;
      const overId = over.id as WidgetId;

      // Determine which column each widget is in
      const activeInMain = mainWidgets.includes(activeId);
      const overInMain = mainWidgets.includes(overId);
      const activeInSidebar = sidebarWidgets.includes(activeId);
      const overInSidebar = sidebarWidgets.includes(overId);

      let newMain = [...mainWidgets];
      let newSidebar = [...sidebarWidgets];

      // Same column: reorder within column
      if (activeInMain && overInMain) {
        const oldIndex = newMain.indexOf(activeId);
        const newIndex = newMain.indexOf(overId);
        newMain = arrayMove(newMain, oldIndex, newIndex);
      } else if (activeInSidebar && overInSidebar) {
        const oldIndex = newSidebar.indexOf(activeId);
        const newIndex = newSidebar.indexOf(overId);
        newSidebar = arrayMove(newSidebar, oldIndex, newIndex);
      } else if (activeInMain && overInSidebar) {
        // Move from main to sidebar
        newMain = newMain.filter((id) => id !== activeId);
        const insertIdx = newSidebar.indexOf(overId);
        newSidebar.splice(insertIdx, 0, activeId);
      } else if (activeInSidebar && overInMain) {
        // Move from sidebar to main
        newSidebar = newSidebar.filter((id) => id !== activeId);
        const insertIdx = newMain.indexOf(overId);
        newMain.splice(insertIdx, 0, activeId);
      }

      // Persist
      const allOrdered = [...newMain, ...newSidebar];
      saveDashboardLayout(allOrdered, Array.from(localHidden));

      // Force re-render by updating state via a custom event
      window.dispatchEvent(
        new CustomEvent("dashboard-layout-change", {
          detail: { mainWidgets: newMain, sidebarWidgets: newSidebar },
        })
      );
    },
    [mainWidgets, sidebarWidgets, localHidden]
  );

  const toggleVisibility = useCallback(
    (id: WidgetId) => {
      setLocalHidden((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        // Persist
        const allOrdered = [...mainWidgets, ...sidebarWidgets];
        saveDashboardLayout(allOrdered, Array.from(next));
        return next;
      });
    },
    [mainWidgets, sidebarWidgets]
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {/* Desktop: 3-column layout. Mobile: stacked. Tablet: 2-column */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 lg:gap-12">
        {/* Main column (2/3 width on desktop) */}
        <div className="md:col-span-2 lg:col-span-2 space-y-6 md:space-y-8 md:pl-8">
          <SortableContext
            items={mainWidgets}
            strategy={verticalListSortingStrategy}
          >
            {mainWidgets.map((id) => (
              <SortableWidget
                key={id}
                id={id}
                hidden={localHidden.has(id)}
                onToggleVisibility={toggleVisibility}
              >
                {renderWidget(id)}
              </SortableWidget>
            ))}
          </SortableContext>
        </div>

        {/* Right sidebar (1/3 width on desktop) */}
        <div className="space-y-6 md:space-y-8 md:pl-8">
          <SortableContext
            items={sidebarWidgets}
            strategy={verticalListSortingStrategy}
          >
            {sidebarWidgets.map((id) => (
              <SortableWidget
                key={id}
                id={id}
                hidden={localHidden.has(id)}
                onToggleVisibility={toggleVisibility}
              >
                {renderWidget(id)}
              </SortableWidget>
            ))}
          </SortableContext>
        </div>
      </div>

      <DragOverlay>
        {activeId ? <DragOverlayContent id={activeId} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
