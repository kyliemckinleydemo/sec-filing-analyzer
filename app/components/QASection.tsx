/**
 * @module app/components/QASection
 * @description Server component that renders a grounded Q&A block as crawlable HTML
 * plus FAQPage JSON-LD structured data. Used on filing pages, company pages, and the
 * explainer library so AI answer engines and search can extract question/answer pairs.
 *
 * Content must be grounded (real data / curated copy) — never templated filler — to
 * stay clear of scaled-content-abuse penalties on this YMYL finance domain.
 * JSON-LD is site-authored/data-derived and "<" is escaped before injection.
 */
import React from 'react';

export interface QAItem {
  question: string;
  /** Plain-text answer used for FAQPage schema (no markup). */
  answer: string;
  /** Optional richer JSX answer for display; falls back to `answer` text. */
  display?: React.ReactNode;
}

interface QASectionProps {
  heading: string;
  items: QAItem[];
  /** Emit FAQPage JSON-LD. Only one FAQPage per page should set this true. */
  emitSchema?: boolean;
  /** Optional note rendered under the heading (e.g., a disclaimer). */
  note?: string;
}

export default function QASection({ heading, items, emitSchema = true, note }: QASectionProps) {
  if (!items || items.length === 0) return null;

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((it) => ({
      '@type': 'Question',
      name: it.question,
      acceptedAnswer: { '@type': 'Answer', text: it.answer },
    })),
  };
  // Escape "<" per Next.js guidance before injecting into a script tag.
  const jsonLdString = JSON.stringify(faqJsonLd).replace(/</g, '\\u003c');

  return (
    <section className="mx-auto max-w-4xl px-4 py-8" aria-label={heading}>
      {emitSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdString }}
        />
      )}
      <h2 className="text-2xl font-bold text-white mb-2">{heading}</h2>
      {note && <p className="text-sm text-gray-400 mb-6">{note}</p>}
      <div className="space-y-5">
        {items.map((it, i) => (
          <div key={i} className="border-b border-white/10 pb-5 last:border-0">
            <h3 className="text-lg font-semibold text-gray-100 mb-2">{it.question}</h3>
            <div className="text-gray-300 leading-relaxed">{it.display ?? it.answer}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
