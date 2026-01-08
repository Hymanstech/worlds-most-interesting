// src/app/api/payment/delete-method/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';

export async function POST(req: NextRequest) {
  try {
    const { paymentMethodId } = await req.json();

    if (!paymentMethodId) {
      return NextResponse.json(
        { error: 'Missing paymentMethodId' },
        { status: 400 }
      );
    }

    await getStripe.paymentMethods.detach(paymentMethodId);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Error detaching payment method:', err);
    return NextResponse.json(
      {
        error: 'Failed to detach payment method',
        details: err?.message ?? 'Unknown error',
      },
      { status: 500 }
    );
  }
}
