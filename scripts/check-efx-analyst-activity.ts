import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get EFX company
  const efx = await prisma.company.findUnique({
    where: { ticker: 'EFX' },
    select: {
      id: true,
      ticker: true,
      name: true,
      analystTargetPrice: true,
      currentPrice: true,
    }
  });

  if (!efx) {
    console.log('EFX not found');
    return;
  }

  console.log('=== EFX Company Info ===');
  console.log(`Ticker: ${efx.ticker}`);
  console.log(`Name: ${efx.name}`);
  console.log(`Current Price: $${efx.currentPrice?.toFixed(2) || 'N/A'}`);
  console.log(`Analyst Target: $${efx.analystTargetPrice?.toFixed(2) || 'N/A'}`);

  if (efx.currentPrice && efx.analystTargetPrice) {
    const upside = ((efx.analystTargetPrice - efx.currentPrice) / efx.currentPrice * 100);
    console.log(`Upside Potential: ${upside.toFixed(1)}%`);
  }

  // Get the filing from 10/20/2025
  const filing = await prisma.filing.findFirst({
    where: {
      companyId: efx.id,
      filingDate: {
        gte: new Date('2025-10-20'),
        lte: new Date('2025-10-21')
      }
    },
    select: {
      accessionNumber: true,
      filingDate: true,
      filingType: true,
      concernLevel: true,
    }
  });

  if (!filing) {
    console.log('\nNo filing found for 10/20/2025');
    return;
  }

  console.log('\n=== Filing Info ===');
  console.log(`Date: ${filing.filingDate.toISOString().split('T')[0]}`);
  console.log(`Type: ${filing.filingType}`);
  console.log(`Concern Level: ${filing.concernLevel?.toFixed(1) || 'N/A'}`);
  console.log(`Accession: ${filing.accessionNumber}`);

  // Check for analyst activity within 30 days before filing
  const filingDate = filing.filingDate;
  const thirtyDaysBefore = new Date(filingDate);
  thirtyDaysBefore.setDate(thirtyDaysBefore.getDate() - 30);

  console.log('\n=== Analyst Activity (30 days before filing) ===');
  console.log(`Window: ${thirtyDaysBefore.toISOString().split('T')[0]} to ${filingDate.toISOString().split('T')[0]}`);

  const analystActivity = await prisma.analystActivity.findMany({
    where: {
      companyId: efx.id,
      activityDate: {
        gte: thirtyDaysBefore,
        lt: filingDate
      }
    },
    orderBy: { activityDate: 'desc' },
    select: {
      activityDate: true,
      firm: true,
      actionType: true,
      previousRating: true,
      newRating: true,
      previousTarget: true,
      newTarget: true,
    }
  });

  if (analystActivity.length === 0) {
    console.log('❌ No analyst activity found in 30-day window');
  } else {
    console.log(`✅ Found ${analystActivity.length} analyst actions:\n`);

    let upgrades = 0;
    let downgrades = 0;
    let majorFirmUpgrades = 0;
    let majorFirmDowngrades = 0;

    const majorFirms = ['Goldman Sachs', 'Morgan Stanley', 'JP Morgan', 'Bank of America', 'Citi', 'Wells Fargo', 'Barclays', 'UBS'];

    analystActivity.forEach(activity => {
      const date = activity.activityDate.toISOString().split('T')[0];
      const isMajorFirm = majorFirms.some(f => activity.firm.includes(f));

      console.log(`${date} | ${activity.firm}${isMajorFirm ? ' ⭐' : ''}`);
      console.log(`  Action: ${activity.actionType}`);
      if (activity.previousRating && activity.newRating) {
        console.log(`  Rating: ${activity.previousRating} → ${activity.newRating}`);
      }
      if (activity.previousTarget && activity.newTarget) {
        console.log(`  Target: $${activity.previousTarget} → $${activity.newTarget}`);
      }

      if (activity.actionType === 'upgrade') {
        upgrades++;
        if (isMajorFirm) majorFirmUpgrades++;
      } else if (activity.actionType === 'downgrade') {
        downgrades++;
        if (isMajorFirm) majorFirmDowngrades++;
      }

      console.log('');
    });

    console.log('=== Summary ===');
    console.log(`Total Upgrades: ${upgrades}${majorFirmUpgrades > 0 ? ` (${majorFirmUpgrades} major firms)` : ''}`);
    console.log(`Total Downgrades: ${downgrades}${majorFirmDowngrades > 0 ? ` (${majorFirmDowngrades} major firms)` : ''}`);
    console.log(`Net Activity: ${upgrades - downgrades > 0 ? '+' : ''}${upgrades - downgrades}`);

    // Calculate model impact
    const netUpgrades = upgrades - downgrades;
    const baseImpact = Math.max(-2, Math.min(2, netUpgrades * 0.3)); // Capped at ±2%
    const majorFirmImpact = (majorFirmUpgrades * 0.5) - (majorFirmDowngrades * 0.5);
    const totalImpact = baseImpact + majorFirmImpact;

    console.log(`\n=== Model Impact ===`);
    console.log(`Base Impact (net upgrades * 0.3): ${baseImpact > 0 ? '+' : ''}${baseImpact.toFixed(2)}%`);
    console.log(`Major Firm Impact: ${majorFirmImpact > 0 ? '+' : ''}${majorFirmImpact.toFixed(2)}%`);
    console.log(`Total Analyst Impact: ${totalImpact > 0 ? '+' : ''}${totalImpact.toFixed(2)}%`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
