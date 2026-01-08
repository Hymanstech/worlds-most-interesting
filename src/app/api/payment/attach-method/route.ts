// src/app/api/payment/attach-method/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';

// Ensure Node runtime for Stripe SDK
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const stripe = getStripe();

    const body = (await req.json().catch(() => ({}))) as {
      customerId?: string;
      paymentMethodId?: string;
    };

    const customerId = body.customerId?.trim();
    const paymentMethodId = body.paymentMethodId?.trim();

    if (!customerId || !paymentMethodId) {
      return NextResponse.json(
        { error: 'Missing customerId or paymentMethodId' },
        { status: 400 }
      );
    }

    // 1) Retrieve payment method to verify ownership
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);

    const pmCustomer =
      typeof pm.customer === 'string'
        ? pm.customer
        : (pm.customer as any)?.id ?? null;

    // 2) If PM is attached to a different customer, fail cleanly
    if (pmCustomer && pmCustomer !== customerId) {
      return NextResponse.json(
        {
          error: 'This payment method is already attached to a different customer.',
          details: `paymentMethod.customer=${pmCustomer} does not match customerId=${customerId}`,
        },
        { status: 409 }
      );
    }

    // 3) If PM isn't attached yet, attach it
    if (!pmCustomer) {
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId,
      });
    }

    // 4) Set as default payment method for off-session charging
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    return NextResponse.json(
      { success: true, customerId, paymentMethodId },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('Error in attach-method route:', err);

    return NextResponse.json(
      {
        error: 'Failed to set default payment method',
        details: err?.message ?? 'Unknown error',
      },
      { status: 500 }
    );
  }
}
