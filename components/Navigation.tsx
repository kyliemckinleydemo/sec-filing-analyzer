/**
 * @module Navigation
 * @description Main navigation header component for the StockHuntr application
 * 
 * PURPOSE:
 * - Provides consistent site-wide navigation with branding and primary menu links
 * - Displays user authentication state and profile access via UserMenu component
 * - Offers quick access to core features: Query, Latest Filings, Watchlist, Alerts, AI Chat, and FAQ
 * - Implements sticky header with glassmorphism styling for modern UI aesthetic
 * - Routes users to various application sections via Next.js navigation
 * 
 * EXPORTS:
 * - Navigation: Main navigation header component with responsive layout and interactive menu
 * 
 * CLAUDE NOTES:
 * - Client-side component using Next.js 13+ App Router ('use client' directive)
 * - Styled with Tailwind CSS featuring custom gradient effects and backdrop blur
 * - Contains inline JSX styles for hover animations on navigation links
 * - Logo includes radial gradient with cyan-to-green color scheme and shadow effects
 * - Navigation items include title tooltips describing each section's functionality
 * - Responsive design: full navigation hidden on mobile (<md breakpoint)
 * - Tracks 640+ companies per badge label; may need updating if count changes
 * - CTA button ("Start Free") directs to profile page for user onboarding
 */

'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { UserMenu } from '@/components/UserMenu';

export function Navigation() {
  const router = useRouter();

  return (
    <header className="sticky top-0 z-50 backdrop-blur-[18px] bg-[#020617] border-b border-white/[0.24]">
      <div className="container mx-auto px-6 py-3 flex items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-[radial-gradient(circle_at_20%_0%,#22d3ee_0%,#22c55e_45%,#0f172a_100%)] flex items-center justify-center text-sm font-bold text-[#0b1120] shadow-[0_10px_30px_rgba(34,197,94,0.45)] cursor-pointer" onClick={() => router.push('/')}>
            SH
          </div>
          <div>
            <div className="font-bold text-base tracking-wide cursor-pointer" onClick={() => router.push('/')}>
              StockHuntr
            </div>
            <div className="text-[10px] uppercase tracking-[0.12em] px-2.5 py-0.5 rounded-full border border-white/40 text-muted-foreground inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_0_4px_rgba(34,197,94,0.4)]"></span>
              AI-Powered SEC Filings
            </div>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-5 text-sm text-muted-foreground">
          <button onClick={() => router.push('/query')} className="hover-underline" title="Search and filter through all 640+ tracked companies">
            Query
          </button>
          <button onClick={() => router.push('/latest-filings')} className="hover-underline" title="Browse the most recent SEC filings from all tracked companies">
            Latest Filings
          </button>
          <button onClick={() => router.push('/watchlist')} className="hover-underline" title="Track specific companies and get email alerts (requires signup)">
            Watchlist
          </button>
          <button onClick={() => router.push('/alerts')} className="hover-underline" title="Manage your alert preferences and notification settings (requires signup)">
            Alerts
          </button>
          <button onClick={() => router.push('/chat')} className="hover-underline" title="Ask questions about company filings in plain English using AI">
            AI Chat
          </button>
          <button onClick={() => router.push('/faq')} className="hover-underline" title="Frequently asked questions and documentation">
            FAQ
          </button>
        </nav>

        <div className="flex items-center gap-3">
          <UserMenu />
          <Button
            onClick={() => router.push('/profile')}
            className="bg-gradient-to-br from-primary to-secondary text-[#0b1120] font-semibold shadow-[0_14px_30px_rgba(34,197,94,0.36)] hover:brightness-110"
          >
            Start Free
          </Button>
        </div>
      </div>

      <style jsx>{`
        .hover-underline {
          position: relative;
        }
        .hover-underline::after {
          content: '';
          position: absolute;
          left: 0;
          bottom: -4px;
          width: 0;
          height: 2px;
          border-radius: 999px;
          background: linear-gradient(to right, #22c55e, #22d3ee);
          transition: width 0.16s ease-out;
        }
        .hover-underline:hover::after {
          width: 100%;
        }
      `}</style>
    </header>
  );
}
