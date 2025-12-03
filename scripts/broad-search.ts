import { filingParser } from '../lib/filing-parser';

async function main() {
  const filingUrl = 'https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl-20250927.htm';

  const response = await fetch(filingUrl, {
    headers: { 'User-Agent': 'SEC Filing Analyzer contact@bluecomet.ai' },
  });

  const html = await response.text();
  const cleaned = filingParser['cleanHtml'](html);

  console.log(`Document length: ${cleaned.length.toLocaleString()} chars\n`);

  // Search for simpler patterns
  const searches = [
    'ITEM 1A',
    'Item 1A',
    'RISK FACTORS',
    'Risk Factors',
    'ITEM 7',
    'Item 7',
    'MANAGEMENT',
    'Management',
  ];

  for (const term of searches) {
    const index = cleaned.indexOf(term);
    if (index !== -1) {
      console.log(`✅ Found "${term}" at position ${index.toLocaleString()} (${((index / cleaned.length) * 100).toFixed(1)}%)`);

      // Show context
      const start = Math.max(0, index - 100);
      const end = Math.min(cleaned.length, index + term.length + 200);
      console.log('Context:');
      console.log('─'.repeat(80));
      console.log(cleaned.slice(start, end).replace(/\n/g, '\n'));
      console.log('─'.repeat(80));
      console.log();
    } else {
      console.log(`❌ Not found: "${term}"`);
    }
  }

  // Look for the actual content section by searching after TOC
  console.log('\n=== Looking for content after Table of Contents ===\n');

  const tocEnd = cleaned.indexOf('Part I');
  if (tocEnd !== -1) {
    console.log(`Found "Part I" at position ${tocEnd.toLocaleString()}`);

    // Show 2000 chars after "Part I" to see the structure
    console.log('\nContent after "Part I":');
    console.log('─'.repeat(80));
    console.log(cleaned.slice(tocEnd, tocEnd + 2000));
    console.log('─'.repeat(80));
  }
}

main().catch(console.error);
