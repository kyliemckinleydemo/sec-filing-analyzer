import { filingParser } from '../lib/filing-parser';

async function main() {
  const filingUrl = 'https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl-20250927.htm';

  const response = await fetch(filingUrl, {
    headers: { 'User-Agent': 'SEC Filing Analyzer contact@bluecomet.ai' },
  });

  const html = await response.text();
  const cleaned = filingParser['cleanHtml'](html);

  console.log(`Document length: ${cleaned.length.toLocaleString()} chars\n`);

  // Find ALL occurrences of "Part I" to distinguish TOC from actual content
  console.log('=== Finding all "Part I" occurrences ===\n');

  let searchPos = 0;
  let count = 0;

  while (true) {
    const index = cleaned.indexOf('Part I', searchPos);
    if (index === -1) break;

    count++;
    console.log(`\nOccurrence #${count} at position ${index.toLocaleString()} (${((index / cleaned.length) * 100).toFixed(1)}%):`);

    const start = Math.max(0, index - 100);
    const end = Math.min(cleaned.length, index + 500);
    console.log('─'.repeat(80));
    console.log(cleaned.slice(start, end));
    console.log('─'.repeat(80));

    searchPos = index + 6; // Move past "Part I"

    if (count >= 5) {
      console.log('\n(Showing first 5 occurrences only)');
      break;
    }
  }

  // Look for "Item 1A. Risk Factors" with actual content (not in TOC)
  // The real section will have paragraph text after it, not just a page number
  console.log('\n\n=== Searching for Item 1A with substantial content ===\n');

  searchPos = 0;
  count = 0;

  while (true) {
    const index = cleaned.indexOf('Item 1A', searchPos);
    if (index === -1) break;

    count++;
    // Check if this has substantial content after it (not just a page number)
    const afterText = cleaned.slice(index + 50, index + 500);
    const hasContent = afterText.length > 200 && !afterText.trim().match(/^\d+\s+Item/);

    console.log(`\nOccurrence #${count} at ${index.toLocaleString()} (${((index / cleaned.length) * 100).toFixed(1)}%) - ${hasContent ? '✅ HAS CONTENT' : '❌ TOC Entry'}`);

    const start = Math.max(0, index - 50);
    const end = Math.min(cleaned.length, index + 600);
    console.log('─'.repeat(80));
    console.log(cleaned.slice(start, end));
    console.log('─'.repeat(80));

    searchPos = index + 7;

    if (count >= 5) break;
  }
}

main().catch(console.error);
