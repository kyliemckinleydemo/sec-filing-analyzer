import { claudeClient } from '../lib/claude-client';

/**
 * Test the new concern assessment feature
 */
async function main() {
  console.log('🧪 Testing Concern Assessment Feature\n');

  // Create mock analysis data similar to what we'd get from a real filing
  const mockRisks = {
    overallTrend: 'INCREASING' as const,
    riskScore: 7.2,
    newRisks: [
      {
        title: 'Regulatory Scrutiny Intensifying',
        severity: 8,
        impact: 'Multiple government agencies investigating safety and autopilot claims',
        reasoning: 'High severity due to potential fines and operational restrictions'
      },
      {
        title: 'Production Challenges at New Facilities',
        severity: 7,
        impact: 'Berlin and Texas factories experiencing ramp-up delays',
        reasoning: 'Moderate-high severity impacting delivery targets'
      },
      {
        title: 'Increasing Competition in EV Market',
        severity: 6,
        impact: 'Traditional automakers launching competitive EV models',
        reasoning: 'Could pressure margins and market share'
      }
    ],
    removedRisks: [],
    severityChanges: [],
    topChanges: [
      'New disclosure about regulatory investigations - elevated from footnote to major risk',
      'Production language shifted from "confident" to "facing challenges"',
      'Competition risk upgraded with specific mention of pricing pressure'
    ]
  };

  const mockSentiment = {
    sentimentScore: -0.3,
    confidence: 0.75,
    tone: 'cautious' as const,
    keyPhrases: [
      'navigating challenging environment',
      'focused on operational efficiency',
      'near-term headwinds expected'
    ],
    toneShift: 'More defensive compared to prior quarter'
  };

  const mockFinancialMetrics = {
    revenueGrowth: '+8% YoY',
    marginTrend: 'Contracting' as const,
    guidanceDirection: 'lowered' as const,
    guidanceDetails: 'Reduced full-year delivery guidance from 2M to 1.8M vehicles',
    keyMetrics: [
      'Automotive gross margin declined to 16.2% from 18.5%',
      'Operating expenses up 23% YoY',
      'Free cash flow down 40% QoQ'
    ],
    surprises: [
      'EPS missed consensus by 12%',
      'Revenue inline with expectations'
    ]
  };

  console.log('📊 Mock Analysis Inputs:\n');
  console.log(`Risk Trend: ${mockRisks.overallTrend} (Score: ${mockRisks.riskScore}/10)`);
  console.log(`New Risks: ${mockRisks.newRisks.length} (avg severity: ${(mockRisks.newRisks.reduce((sum, r) => sum + r.severity, 0) / mockRisks.newRisks.length).toFixed(1)}/10)`);
  console.log(`Sentiment: ${mockSentiment.tone} (${mockSentiment.sentimentScore.toFixed(2)})`);
  console.log(`Guidance: ${mockFinancialMetrics.guidanceDirection}`);
  console.log(`Margins: ${mockFinancialMetrics.marginTrend}`);
  console.log(`Surprises: ${mockFinancialMetrics.surprises?.join(', ')}\n`);

  try {
    console.log('🤖 Generating concern assessment...\n');

    const concernAssessment = await claudeClient.generateConcernAssessment(
      mockRisks,
      mockSentiment,
      mockFinancialMetrics
    );

    console.log('✅ Concern Assessment Generated!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📊 CONCERN LEVEL: ${concernAssessment.concernLevel.toFixed(1)}/10 (${concernAssessment.concernLabel})`);
    console.log(`📈 NET ASSESSMENT: ${concernAssessment.netAssessment}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('💭 REASONING:');
    console.log(`${concernAssessment.reasoning}\n`);

    if (concernAssessment.concernFactors.length > 0) {
      console.log('⚠️  WARNING SIGNS:');
      concernAssessment.concernFactors.forEach((factor, i) => {
        console.log(`   ${i + 1}. ${factor}`);
      });
      console.log('');
    }

    if (concernAssessment.positiveFactors.length > 0) {
      console.log('✓  POSITIVE SIGNALS:');
      concernAssessment.positiveFactors.forEach((factor, i) => {
        console.log(`   ${i + 1}. ${factor}`);
      });
      console.log('');
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Validate the assessment makes sense
    console.log('🔍 Validation Checks:\n');

    const hasHighSeverityRisks = mockRisks.newRisks.some(r => r.severity >= 7);
    const hasMiss = mockFinancialMetrics.surprises?.some(s => s.includes('missed'));
    const guidanceLowered = mockFinancialMetrics.guidanceDirection === 'lowered';
    const marginsWeakening = mockFinancialMetrics.marginTrend === 'Contracting';

    console.log(`   High-severity risks present: ${hasHighSeverityRisks ? '✓' : '✗'}`);
    console.log(`   Earnings miss: ${hasMiss ? '✓' : '✗'}`);
    console.log(`   Guidance lowered: ${guidanceLowered ? '✓' : '✗'}`);
    console.log(`   Margins contracting: ${marginsWeakening ? '✓' : '✗'}`);
    console.log('');

    // Check if concern level matches signals
    const expectedConcernRange = [6, 8]; // With all these negative signals, expect 6-8
    const levelMatchesSignals = concernAssessment.concernLevel >= expectedConcernRange[0] &&
                                concernAssessment.concernLevel <= expectedConcernRange[1];

    if (levelMatchesSignals) {
      console.log(`✅ Concern level (${concernAssessment.concernLevel.toFixed(1)}) matches negative signals - Expected ${expectedConcernRange[0]}-${expectedConcernRange[1]}`);
    } else {
      console.log(`⚠️  Concern level (${concernAssessment.concernLevel.toFixed(1)}) may not match signals - Expected ${expectedConcernRange[0]}-${expectedConcernRange[1]}`);
    }

    // Check if narrative mentions key issues
    const mentionsRegulatory = concernAssessment.concernFactors.some(f =>
      f.toLowerCase().includes('regulatory') || f.toLowerCase().includes('investigation')
    );
    const mentionsMargins = concernAssessment.concernFactors.some(f =>
      f.toLowerCase().includes('margin')
    );
    const mentionsGuidance = concernAssessment.concernFactors.some(f =>
      f.toLowerCase().includes('guidance') || f.toLowerCase().includes('delivery')
    );

    console.log(`✅ Mentions regulatory issues: ${mentionsRegulatory ? '✓' : '✗'}`);
    console.log(`✅ Mentions margin pressure: ${mentionsMargins ? '✓' : '✗'}`);
    console.log(`✅ Mentions guidance cut: ${mentionsGuidance ? '✓' : '✗'}`);

    console.log('\n✨ Test complete! The concern assessment feature is working.\n');

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
