const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Deleting all data...');

  await prisma.prediction.deleteMany({});
  console.log('✅ Deleted all predictions');

  await prisma.filing.deleteMany({});
  console.log('✅ Deleted all filings');

  await prisma.company.deleteMany({});
  console.log('✅ Deleted all companies');

  console.log('\n🎉 Database cleared!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
