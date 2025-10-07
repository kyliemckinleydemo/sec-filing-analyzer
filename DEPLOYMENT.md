# Vercel Deployment Guide

## Prerequisites
- GitHub account with repository access
- Vercel account (sign up at https://vercel.com)
- Anthropic API key
- PostgreSQL database (recommended: Vercel Postgres or Supabase)

## Step 1: Set Up Database

### Option A: Vercel Postgres (Recommended)
1. Go to https://vercel.com/dashboard
2. Click "Storage" → "Create Database" → "Postgres"
3. Name it "sec-filing-analyzer-db"
4. Copy the `DATABASE_URL` connection string

### Option B: Supabase
1. Go to https://supabase.com
2. Create a new project
3. Go to Project Settings → Database
4. Copy the "Connection string" (Direct connection)
5. Replace `[YOUR-PASSWORD]` with your actual password

## Step 2: Deploy to Vercel

### Using Vercel Dashboard (Easiest)
1. Go to https://vercel.com/new
2. Import your GitHub repository: `kyliemckinleydemo/sec-filing-analyzer`
3. Configure project:
   - **Framework Preset**: Next.js
   - **Root Directory**: `./`
   - **Build Command**: (leave default)
   - **Install Command**: (leave default)

4. Add Environment Variables:
   ```
   ANTHROPIC_API_KEY=sk-ant-your-key-here
   DATABASE_URL=postgresql://user:pass@host:5432/database
   ```

5. Click "Deploy"

### Using Vercel CLI
```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel

# Follow prompts:
# - Link to existing project? No
# - Project name: sec-filing-analyzer
# - Directory: ./
# - Override settings? No

# Set environment variables
vercel env add ANTHROPIC_API_KEY
vercel env add DATABASE_URL

# Deploy to production
vercel --prod
```

## Step 3: Initialize Database

After first deployment:
1. Go to your Vercel deployment URL
2. The app will automatically run Prisma migrations on first API call
3. Or manually run: `vercel env pull && npx prisma db push`

## Step 4: Verify Deployment

Visit your deployment URL and test:
1. Homepage loads
2. Search for a ticker (e.g., "AAPL")
3. View latest filings
4. Analyze a filing (this will test Claude AI integration)

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | ✅ Yes | Your Anthropic Claude API key |
| `DATABASE_URL` | ✅ Yes | PostgreSQL connection string |
| `NODE_ENV` | Auto-set | Set to `production` by Vercel |

## Troubleshooting

### Build Errors
- **Prisma errors**: Ensure `DATABASE_URL` is set in environment variables
- **API timeout**: API routes have 60s timeout configured in `vercel.json`

### Runtime Errors
- **500 errors**: Check Vercel logs for database connection issues
- **Claude API errors**: Verify `ANTHROPIC_API_KEY` is correct
- **Python errors**: Vercel supports Python execution, but complex scripts may timeout

### Database Issues
- **Connection pool exhausted**: Consider upgrading database plan
- **Slow queries**: Add indexes via Prisma schema updates

## Performance Optimization

1. **Database**: Use connection pooling (already configured in `DATABASE_URL`)
2. **API Routes**: Implement caching for repeated requests
3. **Static Generation**: Consider ISR for frequently accessed pages

## Cost Optimization

- Vercel free tier: 100GB bandwidth, unlimited hobby projects
- Database: Use Vercel Postgres (free tier: 256MB) or Supabase (free tier: 500MB)
- Claude API: Monitor usage at https://console.anthropic.com

## Custom Domain (Optional)

1. Go to Vercel project settings → "Domains"
2. Add your domain (e.g., `sec-analyzer.com`)
3. Follow DNS configuration instructions
4. Vercel automatically provisions SSL certificate

## Monitoring

- **Vercel Analytics**: Auto-enabled, view at project dashboard
- **Error Tracking**: Check Vercel logs for 500 errors
- **Claude API Usage**: Monitor at Anthropic console

## Updating Deployment

```bash
# Commit your changes
git add .
git commit -m "Update feature"
git push origin main

# Vercel automatically deploys on push to main
```

## Support

- Vercel Docs: https://vercel.com/docs
- Next.js Docs: https://nextjs.org/docs
- Prisma Docs: https://www.prisma.io/docs
