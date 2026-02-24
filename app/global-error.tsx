/**
 * @module app/global-error
 * @description Next.js global error boundary component that catches unhandled errors throughout the entire application and displays a styled error UI with recovery options
 *
 * PURPOSE:
 * - Catch and display all unhandled errors that bubble up to the root level of the Next.js application
 * - Log error details to console including error message and optional digest for debugging
 * - Provide user-facing error recovery through 'Try again' reset button and 'Go home' navigation
 * - Render self-contained HTML with inline styles to ensure error UI displays even when CSS fails to load
 *
 * DEPENDENCIES:
 * - react - Provides useEffect hook for error logging side effect on component mount
 *
 * EXPORTS:
 * - GlobalError (component) - Next.js global error boundary that renders full HTML page with error message, recovery buttons, and inline dark-themed styling
 *
 * PATTERNS:
 * - Place in app/ directory as global-error.tsx to catch errors in root layout and entire app
 * - Next.js automatically passes error object with message and optional digest, plus reset() callback
 * - Component must be client-side ('use client') and render complete <html> and <body> tags
 * - Use reset() prop to attempt error recovery, or window.location.href for hard navigation
 *
 * CLAUDE NOTES:
 * - Renders complete HTML/body tags because global errors may occur before root layout renders, requiring self-contained page structure
 * - Uses inline styles instead of CSS classes to ensure styling works even if stylesheets fail to load during error state
 * - Error digest property is optional and typically provided by Next.js for server-side error tracking and correlation
 * - Gradient button styling matches application theme (green-to-cyan) while maintaining accessibility in error state
 */
'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to console for debugging
    console.error('Global application error:', error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          backgroundColor: '#020617',
          color: 'white',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <div style={{
            maxWidth: '600px',
            padding: '32px',
            backgroundColor: 'rgba(15, 23, 42, 0.96)',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            borderRadius: '12px'
          }}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>
              Something went wrong
            </h2>
            <p style={{ color: 'rgba(255, 255, 255, 0.7)', marginBottom: '24px' }}>
              An unexpected error occurred. We've logged the issue and will look into it.
            </p>
            <div style={{
              padding: '16px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: '8px',
              marginBottom: '24px'
            }}>
              <p style={{
                fontSize: '14px',
                color: 'rgba(248, 113, 113, 1)',
                fontFamily: 'monospace'
              }}>
                {error.message || 'An unexpected error occurred'}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={reset}
                style={{
                  padding: '10px 20px',
                  background: 'linear-gradient(to bottom right, #22c55e, #22d3ee)',
                  color: '#0b1120',
                  fontWeight: '600',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Try again
              </button>
              <button
                onClick={() => window.location.href = '/'}
                style={{
                  padding: '10px 20px',
                  background: 'transparent',
                  color: 'white',
                  border: '1px solid rgba(255, 255, 255, 0.45)',
                  borderRadius: '6px',
                  cursor: 'pointer'
                }}
              >
                Go home
              </button>
            </div>

            <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>
                If this problem persists, please try refreshing the page or clearing your browser cache.
              </p>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
