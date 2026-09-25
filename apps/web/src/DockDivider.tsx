import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { Settings } from "./domain";

export type Pane = "workbench" | "preview" | "inspector";
export type PaneWidths = NonNullable<Settings["layout"]>["paneWidths"];

const minimum: Record<Pane, number> = {
  workbench: 320,
  preview: 300,
  inspector: 260,
};

export function DockDivider({
  left,
  right,
  widths,
  onResize,
  onCommit,
}: {
  left: Pane;
  right: Pane;
  widths: PaneWidths;
  onResize: (next: PaneWidths) => void;
  onCommit: (next: PaneWidths) => void;
}) {
  const drag = useRef<{
    x: number;
    leftPixels: number;
    totalPixels: number;
    totalWeight: number;
    base: PaneWidths;
    current: PaneWidths;
  } | null>(null);
  const name = `Resize ${left === "workbench" ? "Workbench" : left === "preview" ? "Preview" : "Inspector"} and ${right === "preview" ? "Preview" : "Inspector"}`;
  const clamp = (value: number, low: number, high: number) =>
    Math.min(Math.max(value, low), high);
  const start = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const root = event.currentTarget.parentElement;
    const first = root?.querySelector<HTMLElement>(`[data-pane="${left}"]`);
    const second = root?.querySelector<HTMLElement>(`[data-pane="${right}"]`);
    if (!first || !second) return;
    const leftPixels = first.getBoundingClientRect().width;
    const totalPixels = leftPixels + second.getBoundingClientRect().width;
    if (totalPixels < minimum[left] + minimum[right]) return;
    drag.current = {
      x: event.clientX,
      leftPixels,
      totalPixels,
      totalWeight: widths[left] + widths[right],
      base: widths,
      current: widths,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.classList.add("resizing-dock");
    event.preventDefault();
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active) return;
    const pixels = clamp(
      active.leftPixels + event.clientX - active.x,
      minimum[left],
      active.totalPixels - minimum[right],
    );
    const leftWeight = clamp(
      (pixels / active.totalPixels) * active.totalWeight,
      10,
      active.totalWeight - 10,
    );
    active.current = {
      ...active.base,
      [left]: leftWeight,
      [right]: active.totalWeight - leftWeight,
    };
    onResize(active.current);
  };
  const finish = () => {
    if (!drag.current) return;
    onCommit(drag.current.current);
    drag.current = null;
    document.body.classList.remove("resizing-dock");
  };
  return (
    <div
      className="dock-divider"
      role="separator"
      aria-label={name}
      aria-orientation="vertical"
      aria-valuemin={10}
      aria-valuemax={90}
      aria-valuenow={Math.round(
        (widths[left] / (widths[left] + widths[right])) * 100,
      )}
      tabIndex={0}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={finish}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const total = widths[left] + widths[right];
        const nextLeft = clamp(
          widths[left] + (event.key === "ArrowRight" ? 3 : -3),
          10,
          total - 10,
        );
        onCommit({
          ...widths,
          [left]: nextLeft,
          [right]: total - nextLeft,
        });
      }}
    />
  );
}
