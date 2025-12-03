import { filingParser } from '../lib/filing-parser';

async function main() {
  const filingUrl = 'https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl-20250927.htm';

  const response = await fetch(filingUrl, {
    headers: { 'User-Agent': 'SEC Filing Analyzer contact@bluecomet.ai' },
  });

  const html = await response.text();
  const cleaned = filingParser['cleanHtml'](html);

  console.log('=== Finding ALL matches for section headers ===\n');

  // Find ALL occurrences of "Item 1A" to distinguish TOC from actual section
  const item1AMatches: Array<{ index: number; context: string }> = [];
  let searchPos = 0;
  const pattern = /Item\s+1A\s*[.:\-]?\s*Risk\s+Factors/gi;

  while (true) {
    const match = cleaned.slice(searchPos).match(pattern);
    if (!match || match.index === undefined) break;

    const actualIndex = searchPos + match.index;
    const contextStart = Math.max(0, actualIndex - 50);
    const contextEnd = Math.min(cleaned.length, actualIndex + match[0].length + 300);

    item1AMatches.push({
      index: actualIndex,
      context: cleaned.slice(contextStart, contextEnd),
    });

    searchPos = actualIndex + match[0].length;
  }

  console.log(`Found ${item1AMatches.length} matches for "Item 1A":\n`);

  item1AMatches.forEach((m, i) => {
    console.log(`Match #${i + 1} at position ${m.index.toLocaleString()} (${((m.index / cleaned.length) * 100).toFixed(1)}%):`);
    console.log('─'.repeat(80));
    console.log(m.context.replace(/\n/g, '\n'));
    console.log('─'.repeat(80));
    console.log();
  });

  // Same for Item 7 (MD&A)
  console.log('\n=== Finding Item 7 (MD&A) ===\n');

  const item7Matches: Array<{ index: number; context: string }> = [];
  searchPos = 0;
  const pattern7 = /Item\s+7\s*[.:\-]?\s*Management/gi;

  while (true) {
    const match = cleaned.slice(searchPos).match(pattern7);
    if (!match || match.index === undefined) break;

    const actualIndex = searchPos + match.index;
    const contextStart = Math.max(0, actualIndex - 50);
    const contextEnd = Math.min(cleaned.length, actualIndex + match[0].length + 300);

    item7Matches.push({
      index: actualIndex,
      context: cleaned.slice(contextStart, contextEnd),
    });

    searchPos = actualIndex + match[0].length;
  }

  console.log(`Found ${item7Matches.length} matches for "Item 7":\n`);

  item7Matches.forEach((m, i) => {
    console.log(`Match #${i + 1} at position ${m.index.toLocaleString()} (${((m.index / cleaned.length) * 100).toFixed(1)}%):`);
    console.log('─'.repeat(80));
    console.log(m.context.replace(/\n/g, '\n'));
    console.log('─'.repeat(80));
    console.log();
  });

  // Show where Item 1B starts (end marker for Item 1A)
  console.log('\n=== Finding Item 1B (end marker for Risk Factors) ===\n');
  const item1BMatch = cleaned.match(/Item\s+1B\s*[.:\-]?/i);
  if (item1BMatch && item1BMatch.index !== undefined) {
    const pos = item1BMatch.index;
    console.log(`Found at position ${pos.toLocaleString()} (${((pos / cleaned.length) * 100).toFixed(1)}%)`);
    const contextStart = Math.max(0, pos - 200);
    const contextEnd = Math.min(cleaned.length, pos + 100);
    console.log('Context:');
    console.log('─'.repeat(80));
    console.log(cleaned.slice(contextStart, contextEnd));
    console.log('─'.repeat(80));
  }
}

main().catch(console.error);
