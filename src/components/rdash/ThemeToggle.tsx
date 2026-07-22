"use client";
import * as React from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ThemeToggle — 3-way theme switcher (light → dark → system → light).
 *
 * CRON-9: Upgraded from 2-way (light/dark) to 3-way with system preference.
 * The "system" option follows the user's OS dark mode setting via matchMedia.
 * Cycles: light → dark → system → light.
 *
 * Features:
 * - 3 states: light (Sun), dark (Moon), system (Monitor)
 * - Animated icon transitions (rotate + scale)
 * - Active scale animation on press
 * - Tooltip showing current + next state
 */
export function ThemeToggle({ className }: {
    className?: string;
}) {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => setMounted(true), []);

    // Cycle: light → dark → system → light
    const cycle = () => {
        if (theme === "light") setTheme("dark");
        else if (theme === "dark") setTheme("system");
        else setTheme("light");
    };

    const isDark = theme === "dark";
    const isSystem = theme === "system" || !theme;
    const Icon = isDark ? Moon : isSystem ? Monitor : Sun;
    const label = isDark ? "Dark mode (click for system)" : isSystem ? "System mode (click for light)" : "Light mode (click for dark)";

    return (
        <button
            type="button"
            onClick={cycle}
            className={cn(
                "group inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all hover:scale-110 hover:bg-accent active:scale-95",
                className
            )}
            aria-label={label}
            title={label}
        >
            {mounted ? (
                <Icon className="h-4 w-4 transition-transform duration-300 group-hover:rotate-12" />
            ) : (
                <div className="h-4 w-4" />
            )}
        </button>
    );
}
