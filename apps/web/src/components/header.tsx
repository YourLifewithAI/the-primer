"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
  useUser,
} from "@clerk/nextjs";
import { useState, useRef, useEffect, useCallback } from "react";
import { NotificationBell } from "@/components/notification-bell";

const studentLinks = [
  { href: "/learn", label: "My Playlist" },
  { href: "/review", label: "Review" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/courses", label: "Courses" },
];

const guideLinks = [
  { href: "/guide", label: "Guide Dashboard" },
  { href: "/courses", label: "Courses" },
];

const parentLinks = [
  { href: "/parent", label: "Parent Dashboard" },
];

const adminLinks = [
  { href: "/admin", label: "Admin" },
];

export function Header() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const { user } = useUser();
  const mobileMenuRef = useRef<HTMLElement>(null);

  // Determine role
  const role = (user?.publicMetadata?.role as string) ?? "STUDENT";
  const isAdmin = role === "ADMIN";
  const isGuide = role === "GUIDE" || role === "ADMIN";
  const isParent = role === "PARENT";

  // Show role-appropriate links
  const navLinks = isParent
    ? parentLinks
    : isGuide
      ? [
          ...guideLinks,
          ...studentLinks.filter((l) => l.href !== "/courses"),
          ...(isAdmin ? adminLinks : []),
        ]
      : studentLinks;

  // Close mobile menu on Escape
  const handleMenuKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && menuOpen) {
        setMenuOpen(false);
      }
    },
    [menuOpen],
  );

  useEffect(() => {
    if (menuOpen) {
      document.addEventListener("keydown", handleMenuKeyDown);
      return () => document.removeEventListener("keydown", handleMenuKeyDown);
    }
  }, [menuOpen, handleMenuKeyDown]);

  return (
    <header
      className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      role="banner"
    >
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link
          href="/"
          className="font-bold text-lg tracking-tight"
          aria-label="The Primer — home"
        >
          The Primer
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6" aria-label="Main navigation">
          <SignedIn>
            {navLinks.map((link) => {
              const isActive =
                pathname === link.href || pathname.startsWith(link.href + "/");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-sm transition-colors ${
                    isActive
                      ? "text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  aria-current={isActive ? "page" : undefined}
                >
                  {link.label}
                </Link>
              );
            })}
          </SignedIn>
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <SignedOut>
            <SignInButton mode="modal">
              <button className="text-sm px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer">
                Sign In
              </button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <NotificationBell />
            <UserButton afterSignOutUrl="/" />
            {/* Mobile hamburger */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden p-2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                {menuOpen ? (
                  <path d="M4 4L16 16M16 4L4 16" />
                ) : (
                  <path d="M3 5h14M3 10h14M3 15h14" />
                )}
              </svg>
            </button>
          </SignedIn>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <SignedIn>
          <nav
            ref={mobileMenuRef}
            id="mobile-nav"
            className="md:hidden border-t border-border px-4 py-3 space-y-2 bg-background"
            aria-label="Mobile navigation"
          >
            {navLinks.map((link) => {
              const isActive =
                pathname === link.href || pathname.startsWith(link.href + "/");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className={`block py-2 text-sm transition-colors ${
                    isActive
                      ? "text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  aria-current={isActive ? "page" : undefined}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </SignedIn>
      )}
    </header>
  );
}
