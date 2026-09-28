import { redirect } from 'next/navigation';

/**
 * /filing with no accession number has no content — redirect permanently
 * to the live filing feed. This resolves the "Not found (404)" issue
 * in Google Search Console.
 */
export default function FilingIndexPage() {
  redirect('/latest-filings');
}
