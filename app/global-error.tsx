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
