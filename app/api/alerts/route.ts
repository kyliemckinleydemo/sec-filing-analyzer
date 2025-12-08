import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/alerts - Get user's alert preferences
export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const alerts = await prisma.alert.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ alerts });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch alerts' },
      { status: 500 }
    );
  }
}

// POST /api/alerts - Create new alert preference
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { alertType, ticker, sector, enabled, frequency, deliveryTime, minConcernLevel, minPredictedReturn } = await request.json();

    if (!alertType) {
      return NextResponse.json(
        { error: 'Alert type is required' },
        { status: 400 }
      );
    }

    const alert = await prisma.alert.create({
      data: {
        userId: session.userId,
        alertType,
        ticker: ticker || null,
        sector: sector || null,
        enabled: enabled !== undefined ? enabled : true,
        frequency: frequency || 'immediate',
        deliveryTime: deliveryTime || 'both',
        minConcernLevel: minConcernLevel || null,
        minPredictedReturn: minPredictedReturn || null,
      },
    });

    return NextResponse.json({ alert });
  } catch (error) {
    console.error('Error creating alert:', error);
    return NextResponse.json(
      { error: 'Failed to create alert' },
      { status: 500 }
    );
  }
}

// PATCH /api/alerts - Update alert preference
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id, enabled, frequency, deliveryTime, minConcernLevel, minPredictedReturn } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: 'Alert ID is required' },
        { status: 400 }
      );
    }

    // Verify alert belongs to user
    const existingAlert = await prisma.alert.findFirst({
      where: { id, userId: session.userId },
    });

    if (!existingAlert) {
      return NextResponse.json(
        { error: 'Alert not found' },
        { status: 404 }
      );
    }

    const alert = await prisma.alert.update({
      where: { id },
      data: {
        ...(enabled !== undefined && { enabled }),
        ...(frequency && { frequency }),
        ...(deliveryTime && { deliveryTime }),
        ...(minConcernLevel !== undefined && { minConcernLevel }),
        ...(minPredictedReturn !== undefined && { minPredictedReturn }),
      },
    });

    return NextResponse.json({ alert });
  } catch (error) {
    console.error('Error updating alert:', error);
    return NextResponse.json(
      { error: 'Failed to update alert' },
      { status: 500 }
    );
  }
}

// DELETE /api/alerts - Delete alert preference
export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Alert ID is required' },
        { status: 400 }
      );
    }

    // Verify alert belongs to user
    const existingAlert = await prisma.alert.findFirst({
      where: { id, userId: session.userId },
    });

    if (!existingAlert) {
      return NextResponse.json(
        { error: 'Alert not found' },
        { status: 404 }
      );
    }

    await prisma.alert.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting alert:', error);
    return NextResponse.json(
      { error: 'Failed to delete alert' },
      { status: 500 }
    );
  }
}
