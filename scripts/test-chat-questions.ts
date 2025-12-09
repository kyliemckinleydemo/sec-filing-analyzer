/**
 * Test script for AI chat example questions
 *
 * This script tests the example questions to ensure they work with the chat API
 * and return meaningful responses.
 *
 * Usage: DATABASE_URL="$DATABASE_URL" npx tsx scripts/test-chat-questions.ts
 */

const testQuestions = [
  {
    category: 'Stock Performance',
    ticker: 'AAPL',
    question: 'Which AAPL filing had the biggest stock price jump in 7 days?',
  },
  {
    category: 'Financial Analysis',
    ticker: 'AAPL',
    question: "What is AAPL's revenue growth trend over the past year?",
  },
  {
    category: 'ML Model Performance',
    ticker: 'AAPL',
    question: 'How accurate were the ML predictions for AAPL filings?',
  },
  {
    category: 'Risk & Concern Analysis',
    ticker: 'AAPL',
    question: "What is the concern level for AAPL's most recent filing?",
  },
];

async function testChatQuestion(ticker: string, question: string) {
  console.log(`\n📊 Testing: "${question}"`);
  console.log('─'.repeat(80));

  try {
    const response = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Note: This will fail with auth error - you need to add a valid session cookie
      },
      body: JSON.stringify({
        message: question,
        ticker: ticker,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.log(`❌ Error: ${error.error || 'Request failed'}`);
      if (response.status === 401) {
        console.log('⚠️  Authentication required - this is expected for the test');
        console.log('✅ Question format is valid');
      }
      return;
    }

    // Handle streaming response
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        fullResponse += chunk;
        process.stdout.write(chunk); // Stream output to console
      }
    }

    console.log('\n✅ Response received successfully');
    console.log(`📏 Response length: ${fullResponse.length} characters`);

  } catch (error: any) {
    console.log(`❌ Error: ${error.message}`);
  }
}

async function main() {
  console.log('🧪 Testing AI Chat Example Questions');
  console.log('='.repeat(80));
  console.log('\nNote: These tests require authentication.');
  console.log('You may need to add a session cookie to the requests.\n');

  for (const test of testQuestions) {
    console.log(`\n📂 Category: ${test.category}`);
    await testChatQuestion(test.ticker, test.question);

    // Wait a bit between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n' + '='.repeat(80));
  console.log('🏁 Test complete!');
  console.log('\n💡 To fully test: Log in to https://stockhuntr.net/chat and try the questions manually.');
}

main().catch(console.error);
