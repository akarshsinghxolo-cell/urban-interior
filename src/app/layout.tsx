import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
    title: "Urban Castle Business Workspace — Operational Drive & Pinterest",
    description: "Urban Castle unifies customer workspaces, site delivery, procurement, finance, field activity, work categories, and operational media.",
    keywords: [
        "Urban Castle",
        "Operational Drive",
        "Pinterest",
        "Business Workspace",
        "Next.js",
        "TypeScript",
        "Tailwind CSS",
        "shadcn/ui",
    ],
    authors: [{ name: "Urban Castle" }],
    icons: {
        icon: "/logo.svg",
    },
    manifest: "/manifest.json",
};
export const viewport: Viewport = {
    themeColor: "#ffffff",
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: "cover",
};
export default function RootLayout({ children, }: Readonly<{
    children: React.ReactNode;
}>) {
    return (<html lang="en" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        {children}
      </body>
    </html>);
}
