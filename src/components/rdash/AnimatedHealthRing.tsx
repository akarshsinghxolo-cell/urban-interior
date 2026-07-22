"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { ShieldCheck, AlertTriangle, Activity } from "lucide-react";

/**
 * AnimatedHealthRing — a circular SVG progress ring that animates from 0→value.
 * Used in the workspace health dashboard to visualize the integrity score.
 *
 * Features:
 * - Smooth animated stroke-dashoffset on mount + value change
 * - Color-coded by threshold (green ≥90, amber ≥70, red <70)
 * - Pulsing glow effect on the ring
 * - Icon + numeric value in center
 * - Tooltip-friendly (title attribute)
 */
interface AnimatedHealthRingProps {
  /** Score 0-100 */
  value: number;
  /** Ring diameter in px */
  size?: number;
  /** Stroke width in px */
  strokeWidth?: number;
  /** Label under the value */
  label?: string;
  className?: string;
}

export function AnimatedHealthRing({
  value,
  size = 120,
  strokeWidth = 8,
  label = "Integrity",
  className,
}: AnimatedHealthRingProps) {
  const [animatedValue, setAnimatedValue] = React.useState(0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedValue = Math.max(0, Math.min(100, value));

  // Animate from 0→value on mount + when value changes
  React.useEffect(() => {
    const duration = 800;
    const start = performance.now();
    const startVal = animatedValue;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimatedValue(startVal + (clampedValue - startVal) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampedValue]);

  const offset = circumference - (animatedValue / 100) * circumference;
  const color = clampedValue >= 90 ? "var(--success, #22c55e)" : clampedValue >= 70 ? "var(--warning, #f59e0b)" : "var(--destructive, #ef4444)";
  const Icon = clampedValue >= 90 ? ShieldCheck : clampedValue >= 70 ? Activity : AlertTriangle;

  return (
    <div className={cn("relative flex flex-col items-center", className)} title={`${label}: ${clampedValue}/100`}>
      <div className="relative" style={{ width: size, height: size }}>
        {/* Glow effect */}
        <div
          className="absolute inset-0 rounded-full opacity-20 blur-md animate-pulse"
          style={{ backgroundColor: color }}
        />
        <svg width={size} height={size} className="relative -rotate-90">
          {/* Background track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-muted/30"
          />
          {/* Animated progress arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke 0.3s ease" }}
          />
        </svg>
        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          <Icon className="h-5 w-5" style={{ color }} />
          <span className="text-2xl font-bold tabular-nums" style={{ color }}>
            {Math.round(animatedValue)}
          </span>
        </div>
      </div>
      <span className="mt-1 text-xs font-medium text-muted-foreground">{label}</span>
    </div>
  );
}

/**
 * AnimatedCounter — counts up from 0 to value with easing.
 * Used for the health dashboard metric tiles.
 */
export function AnimatedCounter({
  value,
  duration = 600,
  suffix = "",
  className,
}: {
  value: number;
  duration?: number;
  suffix?: string;
  className?: string;
}) {
  const [display, setDisplay] = React.useState(0);
  const prevRef = React.useRef(0);

  React.useEffect(() => {
    const start = performance.now();
    const from = prevRef.current;
    const to = value;
    prevRef.current = value;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return (
    <span className={cn("tabular-nums", className)}>
      {display.toLocaleString("en-IN")}{suffix}
    </span>
  );
}
