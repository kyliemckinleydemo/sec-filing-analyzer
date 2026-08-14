/**
 * @module app/layout
 * @description Defines Next.js root layout providing global HTML structure, Inter font configuration, SEO metadata, and persistent navigation wrapper for all application pages
 *
 * PURPOSE:
 * - Configure Inter font from Google Fonts with Latin character subset for consistent typography
 * - Export SEO metadata with application title, description, and responsive viewport settings
 * - Wrap all page content with Navigation component and apply Inter font className to body element
 * - Establish html/body structure with English language attribute for accessibility
 *
 * DEPENDENCIES:
 * - next - Metadata type definition for Next.js static metadata export
 * - next/font/google - Inter font loader with subset configuration and automatic optimization
 * - ./globals.css - Global CSS styles applied across entire application
 * - ./components/Navigation - Persistent navigation bar rendered above all page content
 *
 * EXPORTS:
 * - metadata (const) - Metadata object with title, description, and viewport configuration for SEO and responsive design
 * - RootLayout (function) - Default export React component wrapping children with html/body tags, Inter font, and Navigation
 *
 * PATTERNS:
 * - Next.js automatically uses this layout for all pages - no manual import needed
 * - Children prop receives page-specific content from Next.js routing system
 * - Metadata object is statically extracted at build time for improved performance
 * - Navigation persists across page transitions while children content updates
 *
 * CLAUDE NOTES:
 * - viewport maximum-scale=5 allows users to zoom up to 500% for accessibility compliance
 * - Inter font className applies only to body - children inherit font-family through CSS cascade
 * - Readonly type on children prop prevents accidental mutation of React node tree
 * - This is a Server Component by default - no 'use client' directive means no client-side JavaScript for layout itself
 */
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import Navigation from "./components/Navigation";

const inter = Inter({ subsets: ["latin"] });

const SITE_URL = "https://www.stockhuntr.net";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "StockHuntr - AI-Powered SEC Filing Intelligence",
    template: "%s | StockHuntr",
  },
  description:
    "StockHuntr analyzes SEC filings (10-K, 10-Q, 8-K) with Claude AI and machine learning to predict 30-day market-relative stock performance. Covering 640+ US companies with data from SEC EDGAR.",
  keywords: [
    "SEC filings",
    "SEC filing analysis",
    "10-K analysis",
    "10-Q analysis",
    "8-K filings",
    "AI stock analysis",
    "SEC EDGAR",
    "stock predictions",
    "filing alerts",
    "earnings analysis",
  ],
  applicationName: "StockHuntr",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
    },
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "StockHuntr",
    title: "StockHuntr - AI-Powered SEC Filing Intelligence",
    description:
      "AI analysis of SEC filings with 30-day alpha predictions. 640+ companies, primary-source EDGAR data, transparent methodology.",
    locale: "en_US",
  },
  twitter: {
    card: "summary",
    title: "StockHuntr - AI-Powered SEC Filing Intelligence",
    description:
      "AI analysis of SEC filings with 30-day alpha predictions. 640+ companies, primary-source EDGAR data, transparent methodology.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

// Structured data so search engines and AI answer engines can resolve
// StockHuntr as an entity and understand what the application does.
// Static developer-controlled content only — never interpolate user input here.
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "StockHuntr",
      url: SITE_URL,
      description:
        "AI-powered SEC filing intelligence platform analyzing 10-K, 10-Q, and 8-K filings to predict 30-day market-relative stock performance.",
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "StockHuntr",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#app`,
      name: "StockHuntr",
      url: SITE_URL,
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web",
      description:
        "Analyzes SEC filings with Claude AI and a Ridge-regression mixture-of-experts model to predict 30-day alpha. Data from SEC EDGAR, Yahoo Finance, and FRED.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ],
};

// Escape "<" per Next.js docs to prevent script-context injection
const jsonLdString = JSON.stringify(jsonLd).replace(/</g, "\\u003c");

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* Microsoft Clarity — analytics + AI Visibility (bot/citation tracking) */}
        <Script id="ms-clarity" strategy="afterInteractive">
          {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","y2djbu69y4");`}
        </Script>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdString }}
        />
        <Navigation />
        {children}
      </body>
    </html>
  );
}
