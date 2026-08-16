/**
 * @module app/api/health/route
 * @description Lightweight health/uptime endpoint. Returns 200 when the app and its database
 * are reachable, 503 when the DB check fails. Intended for external uptime monitors (e.g. a
 * pinger hitting /api/health) and quick manual checks. Does not require auth and does not leak
 * internal error detail.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startedAt = Date.now();
  try {
    // Cheap connectivity check (indexed PK lookup, no raw SQL).
    await prisma.company.findFirst({ select: { id: true } });
    return NextResponse.json(
      { status: 'ok', db: 'up', latencyMs: Date.now() - startedAt },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    // Fail closed with a generic message — no internal detail.
    return NextResponse.json(
      { status: 'degraded', db: 'down' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
