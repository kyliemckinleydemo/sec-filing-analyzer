/**
 * @module app/components/Navigation
 * @description Primary site header: sticky, full-width, dark-themed to match the app.
 * Shows the StockHuntr wordmark and the main sections with active-state highlighting,
 * and collapses to a toggle menu on mobile. Replaces the old floating top-right pill
 * (which overlapped content, had no branding, and didn't scale on small screens).
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const LINKS = [
  { href: '/latest-filings', label: 'Latest Filings' },
  { href: '/pulse', label: 'Pulse' },
  { href: '/sectors', label: 'Sectors' },
  { href: '/query', label: 'Ask the Market' },
  { href: '/model-demo', label: 'Track Record' },
  { href: '/watchlist', label: 'Watchlist' },
  { href: '/faq', label: 'FAQ' },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/');
}

export default function Navigation() {
  const pathname = usePathname() || '/';
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#020617]/85 backdrop-blur print:hidden">
      <nav className="mx-auto max-w-6xl px-4">
        <div className="flex h-14 items-center justify-between">
          {/* Wordmark */}
          <Link href="/" className="flex items-center gap-1.5 font-bold text-white" onClick={() => setOpen(false)}>
            <span className="text-lg tracking-tight">StockHuntr</span>
            <span className="h-1.5 w-1.5 rounded-full bg-teal-400" aria-hidden />
          </Link>

          {/* Desktop links */}
          <div className="hidden items-center gap-1 md:flex">
            {LINKS.map((l) => {
              const active = isActive(pathname, l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? 'page' : undefined}
                  className={
                    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors ' +
                    (active ? 'bg-white/10 text-white' : 'text-gray-300 hover:text-white hover:bg-white/5')
                  }
                >
                  {l.label}
                </Link>
              );
            })}
          </div>

          {/* Mobile toggle */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            className="inline-flex items-center justify-center rounded-md p-2 text-gray-300 hover:bg-white/5 hover:text-white md:hidden"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {open && (
          <div className="grid gap-1 pb-3 md:hidden">
            {LINKS.map((l) => {
              const active = isActive(pathname, l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={
                    'rounded-md px-3 py-2 text-sm font-medium ' +
                    (active ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/5 hover:text-white')
                  }
                >
                  {l.label}
                </Link>
              );
            })}
          </div>
        )}
      </nav>
    </header>
  );
}
