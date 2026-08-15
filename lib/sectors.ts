/**
 * @module lib/sectors
 * @description Canonical sector taxonomy for StockHuntr. The Company.sector field mixes
 * two source taxonomies (GICS-style and Yahoo/Morningstar-style), so the same economic
 * sector appears under multiple raw labels. This normalizes them into one canonical set
 * used for sector insight pages and aggregation.
 */

export interface CanonicalSector {
  slug: string;
  name: string;
  /** All raw Company.sector strings that map to this canonical sector. */
  raw: string[];
  /** One-line description for metadata/intro copy. */
  blurb: string;
}

export const CANONICAL_SECTORS: CanonicalSector[] = [
  {
    slug: 'information-technology',
    name: 'Information Technology',
    raw: ['Information Technology', 'Technology'],
    blurb: 'Software, semiconductors, hardware, and IT services companies.',
  },
  {
    slug: 'financials',
    name: 'Financials',
    raw: ['Financials', 'Financial Services'],
    blurb: 'Banks, insurers, asset managers, and financial-services firms.',
  },
  {
    slug: 'health-care',
    name: 'Health Care',
    raw: ['Health Care', 'Healthcare'],
    blurb: 'Pharmaceuticals, biotech, medical devices, and health services.',
  },
  {
    slug: 'industrials',
    name: 'Industrials',
    raw: ['Industrials'],
    blurb: 'Manufacturing, aerospace, machinery, transportation, and logistics.',
  },
  {
    slug: 'consumer-discretionary',
    name: 'Consumer Discretionary',
    raw: ['Consumer Discretionary', 'Consumer Cyclical'],
    blurb: 'Retail, autos, travel, and other cyclical consumer companies.',
  },
  {
    slug: 'consumer-staples',
    name: 'Consumer Staples',
    raw: ['Consumer Staples', 'Consumer Defensive'],
    blurb: 'Food, beverage, household, and other defensive consumer companies.',
  },
  {
    slug: 'energy',
    name: 'Energy',
    raw: ['Energy'],
    blurb: 'Oil & gas, refining, and energy equipment and services.',
  },
  {
    slug: 'utilities',
    name: 'Utilities',
    raw: ['Utilities'],
    blurb: 'Electric, gas, and water utilities.',
  },
  {
    slug: 'real-estate',
    name: 'Real Estate',
    raw: ['Real Estate'],
    blurb: 'REITs and real-estate management and development companies.',
  },
  {
    slug: 'communication-services',
    name: 'Communication Services',
    raw: ['Communication Services'],
    blurb: 'Telecom, media, entertainment, and interactive media.',
  },
  {
    slug: 'materials',
    name: 'Materials',
    raw: ['Materials', 'Basic Materials'],
    blurb: 'Chemicals, metals & mining, and construction materials.',
  },
];

export function sectorBySlug(slug: string): CanonicalSector | undefined {
  return CANONICAL_SECTORS.find((s) => s.slug === slug);
}

/** Map a raw Company.sector string to its canonical sector (or undefined). */
export function canonicalForRaw(raw: string | null | undefined): CanonicalSector | undefined {
  if (!raw) return undefined;
  return CANONICAL_SECTORS.find((s) => s.raw.includes(raw));
}
