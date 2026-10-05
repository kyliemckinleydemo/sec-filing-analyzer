import { permanentRedirect } from 'next/navigation';

/**
 * /filing with no accession number has no content — redirect permanently
 * to the live filing feed. This resolves the "Not found (404)" issue
 * in Google Search Console. Uses a 308 (permanent) so search engines treat
 * /latest-filings as the canonical destination rather than caching a
 * temporary (307) hop. The bare /filing URL is intentionally absent from
 * the sitemap (see app/sitemap.ts) so it is never advertised for indexing.
 */
export default function FilingIndexPage() {
  permanentRedirect('/latest-filings');
}
