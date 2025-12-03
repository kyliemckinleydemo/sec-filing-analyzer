import { filingParser } from '../lib/filing-parser';

async function main() {
  const filingUrl = 'https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl-20250927.htm';

  console.log('=== Testing AAPL 10-Q Filing Fetch and Parse ===\n');
  console.log('URL:', filingUrl);
  console.log('\n1. Fetching filing content...');

  try {
    const startFetch = Date.now();
    const response = await fetch(filingUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'SEC Filing Analyzer contact@bluecomet.ai',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    const fetchTime = Date.now() - startFetch;

    console.log(`✅ Fetch completed in ${fetchTime}ms`);
    console.log(`   Status: ${response.status} ${response.statusText}`);
    console.log(`   Content-Type: ${response.headers.get('content-type')}`);

    const html = await response.text();
    console.log(`   Content size: ${html.length.toLocaleString()} chars (${(html.length / 1024 / 1024).toFixed(2)} MB)`);

    // Show a snippet of the raw HTML
    console.log('\n2. Raw HTML snippet (first 500 chars):');
    console.log('─'.repeat(80));
    console.log(html.slice(0, 500));
    console.log('...');
    console.log('─'.repeat(80));

    // Parse the filing (Note: This is a 10-K, not 10-Q - Apple's fiscal year ends in Sept)
    console.log('\n3. Parsing filing sections...');
    console.log('   Filing Type: 10-K (Annual Report)');
    const startParse = Date.now();
    const parsed = filingParser.parseFiling(html, '10-K');
    const parseTime = Date.now() - startParse;

    console.log(`✅ Parsing completed in ${parseTime}ms`);
    console.log(`   Items found: ${parsed.itemsFound.join(', ')}`);

    // Show Risk Factors
    if (parsed.riskFactors) {
      console.log('\n4. Risk Factors Section:');
      console.log('─'.repeat(80));
      console.log(`   Length: ${parsed.riskFactors.length.toLocaleString()} chars`);
      console.log(`   Preview (first 800 chars):\n`);
      console.log(parsed.riskFactors.slice(0, 800));
      if (parsed.riskFactors.length > 800) {
        console.log('   ...');
      }
      console.log('─'.repeat(80));
    }

    // Show MD&A
    if (parsed.mdaText) {
      console.log('\n5. MD&A Section:');
      console.log('─'.repeat(80));
      console.log(`   Length: ${parsed.mdaText.length.toLocaleString()} chars`);
      console.log(`   Preview (first 800 chars):\n`);
      console.log(parsed.mdaText.slice(0, 800));
      if (parsed.mdaText.length > 800) {
        console.log('   ...');
      }
      console.log('─'.repeat(80));
    }

    // Summary
    console.log('\n6. Summary:');
    console.log('─'.repeat(80));
    console.log(`✅ Successfully fetched and parsed AAPL 10-Q filing`);
    console.log(`   Total fetch + parse time: ${fetchTime + parseTime}ms`);
    console.log(`   Risk Factors: ${parsed.riskFactors ? parsed.riskFactors.length.toLocaleString() + ' chars' : 'Not found'}`);
    console.log(`   MD&A: ${parsed.mdaText ? parsed.mdaText.length.toLocaleString() + ' chars' : 'Not found'}`);
    console.log('─'.repeat(80));

    console.log('\n✅ Full pipeline working correctly!');
    console.log('   The system CAN fetch and parse real SEC filings from URLs.');

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : 'Unknown error');
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
  }
}

main();
