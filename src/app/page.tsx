"use client";
import { UrbanCastleApp } from "@/components/urban-castle/UrbanCastleApp";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
export default function Home() {
    return (<ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <UrbanCastleApp />
      <Toaster richColors position="top-right"/>
    </ThemeProvider>);
}
