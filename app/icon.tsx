/**
 * @module app/icon
 * @description Generates a dynamic 32x32 PNG favicon with a blue-to-purple gradient and centered 'S' letter using Next.js Edge Runtime
 *
 * PURPOSE:
 * - Renders favicon as server-side ImageResponse instead of static file
 * - Displays white 'S' letter on gradient background with rounded corners
 * - Serves icon at 32x32 pixels via Edge Runtime for global CDN distribution
 *
 * DEPENDENCIES:
 * - next/og - Provides ImageResponse for server-side image generation with HTML/CSS
 *
 * EXPORTS:
 * - runtime (const) - Edge runtime configuration for worldwide CDN deployment
 * - size (const) - Object specifying 32x32 pixel dimensions for favicon
 * - contentType (const) - MIME type 'image/png' for browser favicon recognition
 * - Icon (function) - Default export generating ImageResponse with gradient background and centered letter
 *
 * PATTERNS:
 * - Place in app/icon.tsx for Next.js automatic favicon detection and serving
 * - Next.js serves this at /icon route replacing static favicon.ico
 * - Modify gradient colors in background style or letter text to customize appearance
 *
 * CLAUDE NOTES:
 * - Uses inline styles with flexbox for precise center alignment of letter
 * - Gradient flows 135deg diagonal from blue (#2563eb) to purple (#7c3aed)
 * - Edge runtime enables <50ms global response times vs traditional server rendering
 * - ImageResponse converts JSX to actual PNG bytes - no React rendering in browser
 */
import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
          borderRadius: '6px',
        }}
      >
        <div
          style={{
            fontSize: 20,
            fontWeight: 'bold',
            color: 'white',
          }}
        >
          S
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
