import { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';
import { explainers } from './learn/explainers';
import { CANONICAL_SECTORS } from '@/lib/sectors';
import { comparisons } from './compare/comparisons';

/**
 * @module app/sitemap
 * @description Dynamic sitemap.xml built from the database: static pages, all tracked
 * company pages, and analyzed filing detail pages. Filings without AI analysis are
 * excluded so the sitemap only advertises pages with differentiated content.
 */

const BASE_URL = 'https://www.stockhuntr.net';

// Regenerate at most once per hour
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, changeFrequency: 'daily', priority: 1.0 },
    { url: `${BASE_URL}/latest-filings`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/query`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/model-demo`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/faq`, changeFrequency: 'monthly', priority: 0.8 },
    // NOTE: /backtest removed — page requires auth and redirects unauthenticated users,
    // which causes Google Search Console "page with redirect" warnings.
    { url: `${BASE_URL}/learn`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/sectors`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/pulse`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${BASE_URL}/compare`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE_URL}/terms`, changeFrequency: 'yearly', priority: 0.3 },
  ];

  // Comparison-query pages (alternatives / vs). High-intent GEO landing pages.
  const comparePages: MetadataRoute.Sitemap = comparisons.map((c) => ({
    url: `${BASE_URL}/compare/${c.slug}`,
    lastModified: c.updated ? new Date(c.updated) : undefined,
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  // Curated explainer library — evergreen GEO content.
  const explainerPages: MetadataRoute.Sitemap = explainers.map((e) => ({
    url: `${BASE_URL}/learn/${e.slug}`,
    lastModified: e.updated ? new Date(e.updated) : undefined,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  // Sector insight pages — aggregate original-data content.
  const sectorPages: MetadataRoute.Sitemap = CANONICAL_SECTORS.map((s) => ({
    url: `${BASE_URL}/sectors/${s.slug}`,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  // Run company and filing queries independently so a failure in one
  // doesn't wipe out the other — both fall back to empty arrays.
  let companyPages: MetadataRoute.Sitemap = [];
  let filingPages: MetadataRoute.Sitemap = [];

  try {
    const companies = await prisma.company.findMany({
      select: { ticker: true, yahooLastUpdated: true },
      orderBy: { ticker: 'asc' },
    });
    // Tickers are already uppercase alphanumeric — no encodeURIComponent needed.
    companyPages = companies.map((c) => ({
      url: `${BASE_URL}/company/${c.ticker}`,
      lastModified: c.yahooLastUpdated ?? undefined,
      changeFrequency: 'daily',
      priority: 0.8,
    }));
  } catch (error) {
    console.error('sitemap: failed to load company pages', error);
  }

  try {
    // Only analyzed filings — thin pages stay out of the sitemap.
    const filings = await prisma.filing.findMany({
      where: { aiSummary: { not: null } },
      select: { accessionNumber: true, filingDate: true },
      orderBy: { filingDate: 'desc' },
      take: 5000,
    });
    filingPages = filings.map((f) => ({
      url: `${BASE_URL}/filing/${f.accessionNumber}`,
      lastModified: f.filingDate,
      changeFrequency: 'weekly',
      priority: 0.6,
    }));
  } catch (error) {
    console.error('sitemap: failed to load filing pages', error);
  }

  return [
    ...staticPages,
    ...explainerPages,
    ...sectorPages,
    ...comparePages,
    ...companyPages,
    ...filingPages,
  ];
}
