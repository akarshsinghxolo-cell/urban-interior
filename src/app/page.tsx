"use client";
import { UrbanCastleApp } from "@/components/urban-castle/UrbanCastleApp";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
export default function Home() {
    return (<ThemeProvider attribute="class" defaultTheme="system" enableSystem={true} disableTransitionOnChange>
      <UrbanCastleApp />
      <Toaster richColors position="top-right" mobileOffset={16} toastOptions={{ className: "max-w-[calc(100vw-2rem)]" }}/>
    </ThemeProvider>);
}
