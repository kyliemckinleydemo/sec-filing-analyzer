import { execSync } from 'child_process';

/**
 * Deploy schema changes to production database
 * This script pushes the Prisma schema to the production database
 */

console.log('🚀 Deploying schema to production database...');
console.log('');

try {
  // Apply schema changes to production database
  console.log('📝 Applying schema changes with Prisma...');
  execSync('npx prisma db push', {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL || 'postgresql://fe9090af52d9a5c9ef69af473669e058eed0d6c92b7a0ee48ce7266ad45edfd0:sk_qLWeIJGa7AQy0nRniJwfZ@db.prisma.io:5432/postgres?sslmode=require'
    }
  });

  console.log('');
  console.log('✅ Schema deployed successfully!');
  console.log('');
  console.log('The CompanySnapshot table is now available in production.');

} catch (error: any) {
  console.error('❌ Error deploying schema:', error.message);
  process.exit(1);
}
