/**
 * @module app/components/Breadcrumbs
 * @description Server-rendered breadcrumb trail for analysis pages: a visible nav
 * plus schema.org/BreadcrumbList JSON-LD. Gives search engines a clear hierarchy
 * (eligible for breadcrumb rich results) and adds useful internal links — e.g. a
 * filing page links up to its company page. All values are site-derived; "<" is
 * escaped before JSON-LD injection (same safe pattern used across the app).
 *
 * The last item is the current page (rendered as plain text, not a link).
 */
import Link from 'next/link';

export interface Crumb {
  name: string;
  /** Absolute URL (https://www.stockhuntr.net/...). Omitted/ignored for the current page. */
  url: string;
}

interface BreadcrumbsProps {
  items: Crumb[];
}

export default function Breadcrumbs({ items }: BreadcrumbsProps) {
  if (!items || items.length === 0) return null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: c.url,
    })),
  };
  const jsonLdString = JSON.stringify(jsonLd).replace(/</g, '\\u003c');

  return (
    <nav aria-label="Breadcrumb" className="mx-auto max-w-4xl px-4 pt-6 text-sm text-gray-400">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString }} />
      <ol className="flex flex-wrap items-center gap-x-2">
        {items.map((c, i) => {
          const isLast = i === items.length - 1;
          const path = c.url.replace('https://www.stockhuntr.net', '') || '/';
          return (
            <li key={c.url} className="flex items-center gap-x-2">
              {isLast ? (
                <span className="text-gray-300" aria-current="page">
                  {c.name}
                </span>
              ) : (
                <>
                  <Link href={path} className="hover:text-white underline">
                    {c.name}
                  </Link>
                  <span aria-hidden="true" className="text-gray-600">
                    ›
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
