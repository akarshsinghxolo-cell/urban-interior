"use client";
import { useEffect, useState } from "react";
import { indiaDate } from "./date";

/** Keep long-lived screens on the same business day, including after sleep. */
export function useBusinessDate() {
    const [day, setDay] = useState(() => indiaDate());
    useEffect(() => {
        const update = () => setDay(indiaDate());
        const timer = window.setInterval(update, 60_000);
        window.addEventListener("focus", update);
        return () => { window.clearInterval(timer); window.removeEventListener("focus", update); };
    }, []);
    return day;
}
