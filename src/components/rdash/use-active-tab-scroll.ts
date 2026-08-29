"use client";

import * as React from "react";

/**
 * Keeps the active tab of a horizontal tab strip visible when the active id
 * changes (deep links, programmatic tab switches, or a 360 workspace opening
 * on a non-first section). Without this, the active tab can sit outside the
 * visible strip on phones and the user gets no indication of where they are.
 *
 * Attach `stripRef` to the overflow-x container and spread `bindActiveTab(id)`
 * into each tab button's `ref`.
 */
export function useActiveTabScroll<T extends string>(active: T) {
    const stripRef = React.useRef<HTMLDivElement | null>(null);
    const activeButtonRef = React.useRef<HTMLElement | null>(null);

    const bindActiveTab = React.useCallback(
        (id: T) => (node: HTMLElement | null) => {
            if (node && id === active) activeButtonRef.current = node;
        },
        [active],
    );

    React.useEffect(() => {
        const strip = stripRef.current;
        const node = activeButtonRef.current;
        if (!strip || !node || !strip.contains(node)) return;
        const centered = node.offsetLeft - (strip.clientWidth - node.clientWidth) / 2;
        const next = Math.max(0, Math.min(centered, strip.scrollWidth - strip.clientWidth));
        if (Math.abs(strip.scrollLeft - next) > 1) {
            strip.scrollTo({ left: next, behavior: "smooth" });
        }
    }, [active]);

    return { stripRef, bindActiveTab };
}
