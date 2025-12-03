import { filingParser } from '../lib/filing-parser';

async function main() {
  const filingUrl = 'https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl-20250927.htm';

  const response = await fetch(filingUrl, {
    headers: { 'User-Agent': 'SEC Filing Analyzer contact@bluecomet.ai' },
  });

  const html = await response.text();
  const cleaned = filingParser['cleanHtml'](html);

  console.log('=== Finding all Item 7 matches ===\n');

  const pattern = /Item\s+7\s*[.:\-]\s*Management'?s\s+Discussion/i;
  let searchPos = 0;
  let count = 0;

  while (true) {
    const match = cleaned.slice(searchPos).match(pattern);
    if (!match || match.index === undefined) break;

    const matchPos = searchPos + match.index;
    count++;

    const afterText = cleaned.slice(matchPos + match[0].length, matchPos + match[0].length + 500);
    const hasContent = afterText.trim().length > 100 &&
                      !afterText.trim().match(/^\d+\s+(Item|ITEM|Part|PART)/);

    console.log(`\nMatch #${count} at position ${matchPos.toLocaleString()} (${((matchPos / cleaned.length) * 100).toFixed(1)}%)`);
    console.log(`Matched: "${match[0]}"`);
    console.log(`Has content: ${hasContent ? '✅ YES' : '❌ NO'}`);
    console.log(`After text (first 200 chars):`);
    console.log('─'.repeat(80));
    console.log(afterText.slice(0, 200));
    console.log('─'.repeat(80));

    searchPos = matchPos + match[0].length;

    if (count >= 5) break;
  }
}

main().catch(console.error);
