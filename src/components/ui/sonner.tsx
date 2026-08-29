"use client";
import * as React from "react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, ToasterProps } from "sonner";

/**
 * Responsive toast placement: bottom-centre on phones (Material standard —
 * keeps the sticky workspace header and module tabs readable), top-right on
 * sm+ screens. Sonner's `position` is not responsive, so the wrapper tracks
 * the breakpoint itself.
 */
const Toaster = ({ ...props }: ToasterProps) => {
    const { theme = "system" } = useTheme();
    const [isWide, setIsWide] = React.useState(true);
    React.useEffect(() => {
        const query = window.matchMedia("(min-width: 640px)");
        const update = () => setIsWide(query.matches);
        update();
        query.addEventListener("change", update);
        return () => query.removeEventListener("change", update);
    }, []);
    return (<Sonner theme={theme as ToasterProps["theme"]} className="toaster group qa-wrapper-v2" position={isWide ? "top-right" : "bottom-center"} style={{
            "--normal-bg": "var(--popover)",
            "--normal-text": "var(--popover-foreground)",
            "--normal-border": "var(--border)",
        } as React.CSSProperties} {...props}/>);
};
export { Toaster };
