import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[Watchlist Alerts] Starting cron job...');
    const startTime = Date.now();

    // Get filings from last 24 hours
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const recentFilings = await prisma.filing.findMany({
      where: {
        filingDate: { gte: yesterday },
        filingType: { in: ['10-K', '10-Q', '8-K'] },
      },
      include: {
        company: {
          select: {
            ticker: true,
            name: true,
            sector: true,
          },
        },
      },
      orderBy: { filingDate: 'desc' },
    });

    // Get analyst activity from last 24 hours
    const recentAnalystActivity = await prisma.analystActivity.findMany({
      where: {
        activityDate: { gte: yesterday },
      },
      include: {
        company: {
          select: {
            ticker: true,
            name: true,
          },
        },
      },
      orderBy: { activityDate: 'desc' },
    });

    console.log(`[Watchlist Alerts] Found ${recentFilings.length} filings and ${recentAnalystActivity.length} analyst activities`);

    // Get all users with enabled alerts
    const usersWithAlerts = await prisma.user.findMany({
      where: {
        alerts: {
          some: {
            enabled: true,
            frequency: 'immediate', // For now, handle immediate alerts (daily/weekly digest can be separate)
          },
        },
      },
      include: {
        alerts: {
          where: { enabled: true, frequency: 'immediate' },
        },
        watchlist: true,
        sectorWatchlist: true,
      },
    });

    console.log(`[Watchlist Alerts] Processing ${usersWithAlerts.length} users with enabled alerts`);

    let emailsSent = 0;
    let errorsCount = 0;

    // Process each user
    for (const user of usersWithAlerts) {
      const userNotifications: Array<{
        type: string;
        filing?: any;
        analystActivity?: any;
      }> = [];

      const watchedTickers = user.watchlist.map(w => w.ticker);
      const watchedSectors = user.sectorWatchlist.map(s => s.sector);

      // Check each alert type
      for (const alert of user.alerts) {
        if (alert.alertType === 'new_filing') {
          // Find filings for watched tickers
          const relevantFilings = recentFilings.filter(f =>
            watchedTickers.includes(f.company.ticker) &&
            (!alert.minConcernLevel || (f.concernLevel && f.concernLevel >= alert.minConcernLevel))
          );

          relevantFilings.forEach(filing => {
            userNotifications.push({ type: 'new_filing', filing });
          });
        }

        if (alert.alertType === 'sector_filing') {
          // Find filings for watched sectors
          const sectorFilings = recentFilings.filter(f =>
            f.company.sector && watchedSectors.some(sector =>
              f.company.sector?.toLowerCase().includes(sector.toLowerCase())
            ) &&
            (!alert.minConcernLevel || (f.concernLevel && f.concernLevel >= alert.minConcernLevel))
          );

          sectorFilings.forEach(filing => {
            userNotifications.push({ type: 'sector_filing', filing });
          });
        }

        if (alert.alertType === 'prediction_result') {
          // Find filings with predictions for watched tickers
          const predictedFilings = recentFilings.filter(f =>
            watchedTickers.includes(f.company.ticker) &&
            f.predicted7dReturn !== null &&
            (!alert.minPredictedReturn || f.predicted7dReturn >= alert.minPredictedReturn) &&
            (!alert.minConcernLevel || (f.concernLevel && f.concernLevel >= alert.minConcernLevel))
          );

          predictedFilings.forEach(filing => {
            userNotifications.push({ type: 'prediction_result', filing });
          });
        }

        if (alert.alertType === 'analyst_change') {
          // Find analyst activities for watched tickers
          const relevantActivity = recentAnalystActivity.filter(a =>
            watchedTickers.includes(a.company.ticker)
          );

          relevantActivity.forEach(activity => {
            userNotifications.push({ type: 'analyst_change', analystActivity: activity });
          });
        }
      }

      // Send email if there are notifications
      if (userNotifications.length > 0) {
        try {
          await sendAlertEmail(user.email, userNotifications);
          emailsSent++;
          console.log(`[Watchlist Alerts] Sent email to ${user.email} with ${userNotifications.length} alerts`);
        } catch (error) {
          console.error(`[Watchlist Alerts] Failed to send email to ${user.email}:`, error);
          errorsCount++;
        }
      }
    }

    const duration = Date.now() - startTime;

    console.log(`[Watchlist Alerts] Completed in ${duration}ms. Emails sent: ${emailsSent}, Errors: ${errorsCount}`);

    return NextResponse.json({
      success: true,
      stats: {
        filings: recentFilings.length,
        analystActivities: recentAnalystActivity.length,
        usersProcessed: usersWithAlerts.length,
        emailsSent,
        errors: errorsCount,
        durationMs: duration,
      },
    });
  } catch (error: any) {
    console.error('[Watchlist Alerts] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process watchlist alerts' },
      { status: 500 }
    );
  }
}

async function sendAlertEmail(
  email: string,
  notifications: Array<{ type: string; filing?: any; analystActivity?: any }>
) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ||
                  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  // Group notifications by type
  const newFilings = notifications.filter(n => n.type === 'new_filing');
  const sectorFilings = notifications.filter(n => n.type === 'sector_filing');
  const predictions = notifications.filter(n => n.type === 'prediction_result');
  const analystChanges = notifications.filter(n => n.type === 'analyst_change');

  // Build email HTML
  let emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(to right, #2563eb, #7c3aed); padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0;">StockHuntr Watchlist Alerts</h1>
        <p style="color: white; margin: 5px 0 0 0;">Updates for your tracked stocks</p>
      </div>

      <div style="background: white; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
  `;

  // Add new filings section
  if (newFilings.length > 0) {
    emailHtml += `
      <h2 style="color: #1f2937; margin-top: 0;">📄 New Filings (${newFilings.length})</h2>
    `;

    newFilings.forEach(({ filing }) => {
      const concernBadge = filing.concernLevel
        ? `<span style="background: ${getConcernColor(filing.concernLevel)}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px;">Concern: ${filing.concernLevel.toFixed(1)}/10</span>`
        : '';

      emailHtml += `
        <div style="margin-bottom: 15px; padding: 12px; background: #f9fafb; border-left: 3px solid #2563eb; border-radius: 4px;">
          <div style="font-weight: bold; color: #2563eb; margin-bottom: 5px;">
            ${filing.company.ticker} - ${filing.filingType}
          </div>
          <div style="font-size: 14px; color: #6b7280; margin-bottom: 5px;">
            ${filing.company.name}
          </div>
          <div style="font-size: 12px; color: #9ca3af; margin-bottom: 8px;">
            Filed: ${new Date(filing.filingDate).toLocaleDateString()}
          </div>
          ${concernBadge}
          <div style="margin-top: 10px;">
            <a href="${baseUrl}/filing/${filing.accessionNumber}"
               style="color: #2563eb; text-decoration: none; font-size: 14px;">
              View Analysis →
            </a>
          </div>
        </div>
      `;
    });
  }

  // Add predictions section
  if (predictions.length > 0) {
    emailHtml += `
      <h2 style="color: #1f2937; margin-top: 20px;">📈 New Predictions (${predictions.length})</h2>
    `;

    predictions.forEach(({ filing }) => {
      const returnColor = filing.predicted7dReturn >= 0 ? '#10b981' : '#ef4444';

      emailHtml += `
        <div style="margin-bottom: 15px; padding: 12px; background: #f9fafb; border-left: 3px solid #7c3aed; border-radius: 4px;">
          <div style="font-weight: bold; color: #7c3aed; margin-bottom: 5px;">
            ${filing.company.ticker}
          </div>
          <div style="font-size: 14px; color: #6b7280; margin-bottom: 8px;">
            ${filing.company.name}
          </div>
          <div style="font-size: 16px; font-weight: bold; color: ${returnColor};">
            Predicted 7-day return: ${filing.predicted7dReturn >= 0 ? '+' : ''}${filing.predicted7dReturn.toFixed(2)}%
          </div>
          ${filing.predictionConfidence ? `
            <div style="font-size: 12px; color: #9ca3af; margin-top: 5px;">
              Confidence: ${(filing.predictionConfidence * 100).toFixed(0)}%
            </div>
          ` : ''}
          <div style="margin-top: 10px;">
            <a href="${baseUrl}/filing/${filing.accessionNumber}"
               style="color: #7c3aed; text-decoration: none; font-size: 14px;">
              View Details →
            </a>
          </div>
        </div>
      `;
    });
  }

  // Add analyst activity section
  if (analystChanges.length > 0) {
    emailHtml += `
      <h2 style="color: #1f2937; margin-top: 20px;">💼 Analyst Activity (${analystChanges.length})</h2>
    `;

    analystChanges.forEach(({ analystActivity }) => {
      const actionColor = getActionColor(analystActivity.actionType);

      emailHtml += `
        <div style="margin-bottom: 15px; padding: 12px; background: #f9fafb; border-left: 3px solid ${actionColor}; border-radius: 4px;">
          <div style="font-weight: bold; color: ${actionColor}; margin-bottom: 5px;">
            ${analystActivity.company.ticker} - ${formatActionType(analystActivity.actionType)}
          </div>
          <div style="font-size: 14px; color: #6b7280; margin-bottom: 5px;">
            ${analystActivity.company.name}
          </div>
          <div style="font-size: 13px; color: #374151; margin-bottom: 5px;">
            ${analystActivity.firm}
          </div>
          ${analystActivity.previousRating && analystActivity.newRating ? `
            <div style="font-size: 12px; color: #6b7280;">
              ${analystActivity.previousRating} → ${analystActivity.newRating}
            </div>
          ` : ''}
          ${analystActivity.previousTarget && analystActivity.newTarget ? `
            <div style="font-size: 12px; color: #6b7280;">
              Target: $${analystActivity.previousTarget.toFixed(2)} → $${analystActivity.newTarget.toFixed(2)}
            </div>
          ` : ''}
          <div style="font-size: 12px; color: #9ca3af; margin-top: 5px;">
            ${new Date(analystActivity.activityDate).toLocaleDateString()}
          </div>
        </div>
      `;
    });
  }

  // Add sector filings section
  if (sectorFilings.length > 0) {
    emailHtml += `
      <h2 style="color: #1f2937; margin-top: 20px;">🏢 Sector Filings (${sectorFilings.length})</h2>
      <p style="font-size: 14px; color: #6b7280; margin-top: 5px;">Filings from companies in your watched sectors</p>
    `;

    sectorFilings.slice(0, 5).forEach(({ filing }) => {
      emailHtml += `
        <div style="margin-bottom: 10px; padding: 10px; background: #f9fafb; border-radius: 4px;">
          <div style="font-weight: bold; color: #2563eb; font-size: 14px;">
            ${filing.company.ticker} (${filing.company.sector}) - ${filing.filingType}
          </div>
          <div style="font-size: 12px; color: #9ca3af; margin-top: 3px;">
            ${new Date(filing.filingDate).toLocaleDateString()}
          </div>
        </div>
      `;
    });

    if (sectorFilings.length > 5) {
      emailHtml += `
        <div style="font-size: 13px; color: #6b7280; margin-top: 10px;">
          + ${sectorFilings.length - 5} more sector filings
        </div>
      `;
    }
  }

  emailHtml += `
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
          <a href="${baseUrl}/watchlist"
             style="display: inline-block; background: linear-gradient(to right, #2563eb, #7c3aed); color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
            Manage Watchlist
          </a>
          <div style="margin-top: 15px;">
            <a href="${baseUrl}/alerts"
               style="color: #6b7280; text-decoration: none; font-size: 13px;">
              Update Alert Preferences
            </a>
          </div>
        </div>

        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 12px;">
          <p>You're receiving this because you have alerts enabled for your StockHuntr watchlist.</p>
          <p style="margin-top: 5px;">
            <a href="${baseUrl}/alerts" style="color: #9ca3af;">Unsubscribe</a>
          </p>
        </div>
      </div>
    </div>
  `;

  // Send email
  await resend.emails.send({
    from: 'StockHuntr Alerts <alerts@stockhuntr.com>',
    to: email,
    subject: `StockHuntr: ${newFilings.length + predictions.length + analystChanges.length} New Alerts`,
    html: emailHtml,
  });
}

function getConcernColor(concernLevel: number): string {
  if (concernLevel >= 7) return '#dc2626'; // red
  if (concernLevel >= 5) return '#ea580c'; // orange
  if (concernLevel >= 3) return '#ca8a04'; // yellow
  return '#16a34a'; // green
}

function getActionColor(actionType: string): string {
  if (actionType === 'upgrade') return '#10b981';
  if (actionType === 'downgrade') return '#ef4444';
  if (actionType === 'target_raised') return '#3b82f6';
  if (actionType === 'target_lowered') return '#f59e0b';
  return '#6b7280';
}

function formatActionType(actionType: string): string {
  return actionType
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
