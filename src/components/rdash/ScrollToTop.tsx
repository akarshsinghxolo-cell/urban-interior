"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { ArrowUp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
export function ScrollToTop() {
    const [visible, setVisible] = React.useState(false);
    const mainRef = React.useRef<HTMLElement | null>(null);
    React.useEffect(() => {
        const main = document.querySelector("main.rd-scroll") as HTMLElement | null;
        if (!main)
            return;
        mainRef.current = main;
        const onScroll = () => {
            setVisible(main.scrollTop > 400);
        };
        main.addEventListener("scroll", onScroll, { passive: true });
        onScroll();
        return () => main.removeEventListener("scroll", onScroll);
    }, []);
    const scrollToTop = () => {
        mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    };
    if (!visible)
        return null;
    return (<TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" onClick={scrollToTop} aria-label="Jump to top" className={cn("rd-pop-in fixed bottom-20 right-4 z-40 grid h-10 w-10 place-items-center rounded-full border border-border bg-card/95 text-muted-foreground shadow-soft backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-accent hover:text-foreground active:translate-y-0 active:scale-95", "lg:bottom-6 lg:right-6")}>
            <ArrowUp className="h-4 w-4"/>
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" className="text-xs">
          Jump to top
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>);
}
