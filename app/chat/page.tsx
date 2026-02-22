/**
 * @module page
 * @description Chat redirect page component that handles navigation from legacy chat routes to the query page
 * 
 * PURPOSE:
 * - Provides a migration path from old /chat routes to new /query routes
 * - Preserves ticker parameter during redirect
 * - Displays loading state while redirect is processing
 * - Uses Next.js App Router client-side navigation for seamless transition
 * 
 * EXPORTS:
 * - ChatRedirect (default): Main page component with Suspense wrapper for search params handling
 * 
 * CLAUDE NOTES:
 * - This is a client component ('use client') required for useRouter and useSearchParams hooks
 * - The Suspense wrapper is necessary for useSearchParams in Next.js App Router
 * - Uses router.replace() instead of router.push() to avoid adding to browser history
 * - Ticker parameter is properly URL-encoded during redirect
 * - Fallback UI provides visual feedback during the redirect process
 * - Component unmounts immediately after redirect, so no cleanup needed
 */

'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function ChatRedirectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const ticker = searchParams.get('ticker');
    if (ticker) {
      router.replace(`/query?ticker=${encodeURIComponent(ticker)}`);
    } else {
      router.replace('/query');
    }
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>
  );
}

export default function ChatRedirect() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Redirecting...</div>}>
      <ChatRedirectContent />
    </Suspense>
  );
}
