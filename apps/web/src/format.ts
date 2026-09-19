import { useEffect, useState } from "react";
import type { TwinShape } from "@cutonce/schemas";

/** Re-render on a timer, for "connected 12 s ago" style labels. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function ago(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "unknown";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min ago`;
}

export function clock(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleTimeString([], { hour12: false });
}

export function ms(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`;
}

const cm = (m: number) => (m * 100).toFixed(1);

/** "⌀6.6 × 15.7 cm" for a cylinder (width, then length), "35.0 × 4.0 × 35.0 cm" for a box (x, up, z). */
export function shapeSize(shape: TwinShape): string {
  return shape.type === "cylinder" ? `⌀${cm(shape.diameter)} × ${cm(shape.length)} cm` : `${shape.size.map(cm).join(" × ")} cm`;
}
