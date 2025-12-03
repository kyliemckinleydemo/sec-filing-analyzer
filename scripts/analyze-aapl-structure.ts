import { filingParser } from '../lib/filing-parser';

async function main() {
  const filingUrl = 'https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl-20250927.htm';

  console.log('=== Analyzing AAPL 10-Q Filing Structure ===\n');

  const response = await fetch(filingUrl, {
    headers: { 'User-Agent': 'SEC Filing Analyzer contact@bluecomet.ai' },
  });

  const html = await response.text();
  console.log(`Downloaded ${html.length.toLocaleString()} chars\n`);

  // Clean the HTML first
  const cleaned = filingParser['cleanHtml'](html);
  console.log(`After cleaning: ${cleaned.length.toLocaleString()} chars\n`);

  // Search for common 10-Q section headers
  const patterns = [
    /Part\s+I\s*[-–]\s*Financial\s+Information/i,
    /Part\s+I.*?Item\s+1\s*[-.:]\s*Financial\s+Statements/is,
    /Part\s+I.*?Item\s+2\s*[-.:]\s*Management/is,
    /Item\s+2\s*[-.:]\s*Management'?s\s+Discussion/i,
    /Management'?s\s+Discussion\s+and\s+Analysis/i,
    /Part\s+II/i,
    /Risk\s+Factors/i,
    /Item\s+1A.*?Risk/is,
  ];

  console.log('Searching for section headers:\n');

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match && match.index !== undefined) {
      const pos = match.index;
      const contextStart = Math.max(0, pos - 100);
      const contextEnd = Math.min(cleaned.length, pos + match[0].length + 200);
      const context = cleaned.slice(contextStart, contextEnd);

      console.log(`✅ Found: ${pattern.toString()}`);
      console.log(`   Position: ${pos.toLocaleString()} (${((pos / cleaned.length) * 100).toFixed(1)}% through document)`);
      console.log(`   Context:`);
      console.log('   ' + '─'.repeat(76));
      console.log('   ' + context.replace(/\n/g, '\n   '));
      console.log('   ' + '─'.repeat(76));
      console.log();
    } else {
      console.log(`❌ Not found: ${pattern.toString()}`);
    }
  }

  // Show table of contents if present
  console.log('\n=== Searching for Table of Contents ===\n');
  const tocMatch = cleaned.match(/(TABLE\s+OF\s+CONTENTS|INDEX)[\s\S]{0,3000}/i);
  if (tocMatch) {
    console.log('Table of Contents found:');
    console.log('─'.repeat(80));
    console.log(tocMatch[0].slice(0, 2000));
    console.log('─'.repeat(80));
  } else {
    console.log('❌ No table of contents found');
  }

  // Show first 3000 chars to see overall structure
  console.log('\n=== First 3000 chars of cleaned text ===\n');
  console.log('─'.repeat(80));
  console.log(cleaned.slice(0, 3000));
  console.log('─'.repeat(80));
}

main().catch(console.error);
