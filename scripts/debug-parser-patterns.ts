import { filingParser } from '../lib/filing-parser';

async function main() {
  const filingUrl = 'https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl-20250927.htm';

  const response = await fetch(filingUrl, {
    headers: { 'User-Agent': 'SEC Filing Analyzer contact@bluecomet.ai' },
  });

  const html = await response.text();
  const cleaned = filingParser['cleanHtml'](html);

  console.log('=== Testing 10-K Parser Patterns ===\n');

  // Test the exact patterns from parse10K
  const riskFactorPatterns = [
    /Item\s+1A\s*[.:\-]\s*Risk\s+Factors/i,
    /ITEM\s+1A\s*[.:\-]\s*RISK\s+FACTORS/i,
  ];

  const mdaPatterns = [
    /Item\s+7\s*[.:\-]\s*Management'?s\s+Discussion/i,
    /ITEM\s+7\s*[.:\-]\s*MANAGEMENT'?S\s+DISCUSSION/i,
  ];

  console.log('Testing Risk Factor patterns:\n');
  for (const pattern of riskFactorPatterns) {
    const match = cleaned.match(pattern);
    if (match && match.index !== undefined) {
      console.log(`✅ Pattern matched: ${pattern}`);
      console.log(`   Match: "${match[0]}"`);
      console.log(`   Position: ${match.index}`);

      const afterText = cleaned.slice(match.index + match[0].length, match.index + match[0].length + 200);
      console.log(`   Text after: "${afterText.slice(0, 100)}..."`);
    } else {
      console.log(`❌ Pattern did NOT match: ${pattern}`);
    }
    console.log();
  }

  console.log('\nTesting MD&A patterns:\n');
  for (const pattern of mdaPatterns) {
    const match = cleaned.match(pattern);
    if (match && match.index !== undefined) {
      console.log(`✅ Pattern matched: ${pattern}`);
      console.log(`   Match: "${match[0]}"`);
      console.log(`   Position: ${match.index}`);

      const afterText = cleaned.slice(match.index + match[0].length, match.index + match[0].length + 200);
      console.log(`   Text after: "${afterText.slice(0, 100)}..."`);
    } else {
      console.log(`❌ Pattern did NOT match: ${pattern}`);
    }
    console.log();
  }

  // Show what the actual text looks like around Item 1A
  console.log('\n=== Actual text around "Item 1A" (position 40383) ===\n');
  const pos = 40383;
  console.log(cleaned.slice(pos - 50, pos + 250));
}

main().catch(console.error);
