"use client";

import * as React from "react";

/**
 * Let portalled dropdown panels scroll while a Radix modal is open.
 *
 * Radix Dialog locks the page via react-remove-scroll, whose document-level
 * handler preventDefaults EVERY wheel/touchmove event whose target lives
 * outside the dialog DOM — portalled panels (Popover/Select/DropdownMenu
 * content) are exactly that, so their lists could not be wheel- or
 * touch-scrolled while any modal was open (the dialog body itself kept
 * scrolling because it is inside the lock root).
 *
 * The lock listens on `document` in the bubble phase, so stopping those two
 * events at the panel keeps the lock out of the way and the browser scrolls
 * the panel natively; behind the panel the body is overflow-hidden for the
 * duration of the lock, so nothing else moves. Gated on the lock attribute
 * (set by react-remove-scroll-bar) so behaviour is untouched when no modal
 * is open. Passive listeners: we only stop propagation, never preventDefault.
 */
export function useScrollLockPassthrough(element: HTMLElement | null) {
    React.useEffect(() => {
        if (!element) return;
        const stop = (event: Event) => {
            if (document.body.hasAttribute("data-scroll-locked")) event.stopPropagation();
        };
        element.addEventListener("wheel", stop, { passive: true });
        element.addEventListener("touchmove", stop, { passive: true });
        return () => {
            element.removeEventListener("wheel", stop);
            element.removeEventListener("touchmove", stop);
        };
    }, [element]);
}
