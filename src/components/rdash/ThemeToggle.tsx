"use client";
import * as React from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";
export function ThemeToggle({ className }: {
    className?: string;
}) {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => setMounted(true), []);
    const isDark = theme === "dark";
    return (<button type="button" onClick={() => setTheme(isDark ? "light" : "dark")} className={cn("group inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-card text-muted-foreground transition-all hover:scale-105 hover:bg-accent hover:text-foreground active:scale-95", className)} aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"} title={isDark ? "Switch to light mode" : "Switch to dark mode"}>
      {mounted ? (isDark ? (<Sun className="h-4 w-4 transition-transform duration-300 group-hover:rotate-45"/>) : (<Moon className="h-4 w-4 transition-transform duration-300 group-hover:-rotate-12"/>)) : (<div className="h-4 w-4"/>)}
    </button>);
}
