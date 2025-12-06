import { prisma } from '../lib/prisma';

async function testSectorData() {
  console.log('Checking if Company model has sector data...\n');

  // Check total companies
  const totalCompanies = await prisma.company.count();
  console.log(`Total companies in database: ${totalCompanies}`);

  // Check companies with sector data
  const companiesWithSector = await prisma.company.count({
    where: {
      sector: { not: null }
    }
  });
  console.log(`Companies with sector data: ${companiesWithSector}`);

  // Show some examples
  const examples = await prisma.company.findMany({
    where: {
      sector: { not: null }
    },
    take: 10,
    select: {
      ticker: true,
      name: true,
      sector: true,
    }
  });

  console.log('\nExample companies with sector data:');
  examples.forEach(c => {
    console.log(`  ${c.ticker} (${c.name}): ${c.sector}`);
  });

  // Check companies without sector
  const companiesWithoutSector = await prisma.company.findMany({
    where: {
      sector: null
    },
    take: 10,
    select: {
      ticker: true,
      name: true,
    }
  });

  console.log('\nExample companies WITHOUT sector data:');
  companiesWithoutSector.forEach(c => {
    console.log(`  ${c.ticker} (${c.name}): NO SECTOR`);
  });

  // Try a sector query like in the API
  console.log('\n\nTesting sector query for "Technology":');
  const techCompanies = await prisma.company.findMany({
    where: {
      sector: {
        contains: 'Technology',
        mode: 'insensitive'
      }
    },
    take: 5,
    select: {
      ticker: true,
      name: true,
      sector: true,
    },
  });
  console.log(`Found ${techCompanies.length} tech companies:`);
  techCompanies.forEach(c => {
    console.log(`  ${c.ticker}: ${c.sector}`);
  });

  await prisma.$disconnect();
}

testSectorData().catch(console.error);
