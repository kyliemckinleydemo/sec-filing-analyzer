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
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navigation from "./components/Navigation";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "StockHuntr - AI-Powered SEC Filing Intelligence",
  description: "AI-powered SEC filing intelligence to analyze financial data, predict stock movements, and chat with your data using natural language",
  viewport: "width=device-width, initial-scale=1, maximum-scale=5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Navigation />
        {children}
      </body>
    </html>
  );
}
