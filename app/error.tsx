'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to console for debugging
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#0f172a_0%,#020617_50%)] text-foreground flex items-center justify-center p-6">
      <Card className="bg-[rgba(15,23,42,0.96)] border-white/[0.18] max-w-2xl">
        <CardHeader>
          <CardTitle className="text-2xl text-white">Something went wrong</CardTitle>
          <CardDescription>
            An unexpected error occurred. We've logged the issue and will look into it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-sm text-red-400 font-mono">
              {error.message || 'An unexpected error occurred'}
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={reset}
              className="bg-gradient-to-br from-primary to-secondary text-[#0b1120] font-semibold"
            >
              Try again
            </Button>
            <Button
              onClick={() => window.location.href = '/'}
              variant="outline"
              className="border-white/45"
            >
              Go home
            </Button>
          </div>

          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-xs text-muted-foreground">
              If this problem persists, please try refreshing the page or clearing your browser cache.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
