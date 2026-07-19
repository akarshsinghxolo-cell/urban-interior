"use client";
import * as React from "react";
export function MapCacheRegistration() {
    React.useEffect(() => {
        if (!("serviceWorker" in navigator))
            return;
        navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }, []);
    return null;
}
