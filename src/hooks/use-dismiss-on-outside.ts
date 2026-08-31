import * as React from "react";

// ponytail: shared dismissal for hand-rolled dropdowns/popovers (Radix menus
// close themselves; these don't). Uses pointerdown, not click: it fires for
// touch + mouse before the click lands, so the SAME tap both closes the menu
// and reaches its real target — no click-swallowing fixed overlay needed.
export function useDismissOnOutside(
    open: boolean,
    onClose: () => void,
    ref: React.RefObject<HTMLElement | null>,
) {
    React.useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: PointerEvent) => {
            if (!ref.current?.contains(event.target as Node)) onClose();
        };
        const onKeyDown = (event: KeyboardEvent) => {
            // A layer above (dialog/popover) already consumed this Escape.
            if (event.defaultPrevented) return;
            if (event.key === "Escape") {
                event.preventDefault();
                onClose();
            }
        };
        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open, onClose, ref]);
}
