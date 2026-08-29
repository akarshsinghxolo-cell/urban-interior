"use client";
import * as React from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

/**
 * ThemeMenuItem — theme switcher inside the profile dropdown menu.
 *
 * The header ThemeToggle is desktop-only (hidden below lg), which left phones
 * with no visible way to switch themes outside Settings → Appearance. This
 * menu item is rendered in the avatar dropdown (reachable on every viewport)
 * and cycles through the same light → dark → system states.
 */
export function ThemeMenuItem() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => setMounted(true), []);

    if (!mounted) return null;

    const cycle = () => {
        if (theme === "light") setTheme("dark");
        else if (theme === "dark") setTheme("system");
        else setTheme("light");
    };

    const isDark = theme === "dark";
    const isSystem = theme === "system" || !theme;
    const Icon = isDark ? Moon : isSystem ? Monitor : Sun;
    const label = isDark ? "Dark" : isSystem ? "System" : "Light";

    return (
        <DropdownMenuItem onClick={cycle} aria-label={`Theme: ${label} (click to change)`}>
            <Icon className="mr-2 h-4 w-4" />
            <span>
                Theme: <span className="font-semibold">{label}</span>
            </span>
        </DropdownMenuItem>
    );
}
