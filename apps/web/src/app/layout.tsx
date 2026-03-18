import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Header } from "@/components/header";
import { AriaLiveRegion } from "@/components/aria-live-region";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "The Primer",
    template: "%s | The Primer",
  },
  description:
    "Open-source adaptive learning platform. Personalized, mastery-based education for every kid.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://theprimer.app",
  ),
  openGraph: {
    title: "The Primer",
    description:
      "Personalized, mastery-based education for every kid.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="min-h-screen bg-background font-sans antialiased">
          {/* Skip to main content — first focusable element */}
          <a href="#main-content" className="skip-to-content">
            Skip to main content
          </a>

          <Header />

          <div id="main-content" tabIndex={-1}>{children}</div>

          {/* Shared aria-live region for screen reader announcements */}
          <AriaLiveRegion />
        </body>
      </html>
    </ClerkProvider>
  );
}
