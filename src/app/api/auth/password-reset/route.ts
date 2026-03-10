import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';

function buildResetEmailHtml(resetUrl: string) {
  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8fafc;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:24px 24px 18px;background:linear-gradient(135deg,#f8fafc 0%,#e2e8f0 100%);border-bottom:1px solid #e2e8f0;">
                <p style="margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;font-weight:700;">
                  Password Reset
                </p>
                <h1 style="margin:12px 0 0;font-size:30px;line-height:1.15;color:#0f172a;">
                  Reset your password
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#1e293b;">
                  We received a request to reset your World's Most Interesting password.
                </p>
                <p style="margin:0 0 22px;font-size:16px;line-height:1.6;color:#334155;">
                  Use the button below to choose a new password. If you did not request this, you can safely ignore this email.
                </p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="center" style="border-radius:999px;background:#0f172a;">
                      <a href="${resetUrl}" style="display:inline-block;padding:12px 20px;border-radius:999px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">
                        Reset your password
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#64748b;">
                  If the button does not work, open this link:<br />
                  <a href="${resetUrl}" style="color:#0f172a;">${resetUrl}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `;
}

async function sendResetEmail(toEmail: string, resetUrl: string) {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  if (!token) {
    throw new Error('POSTMARK_SERVER_TOKEN is not configured.');
  }

  const res = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': token,
    },
    body: JSON.stringify({
      From: 'crown@worldsmostinteresting.com',
      To: toEmail,
      Subject: "Reset your World's Most Interesting password",
      HtmlBody: buildResetEmailHtml(resetUrl),
      TextBody: `Reset your World's Most Interesting password: ${resetUrl}`,
      MessageStream: 'outbound',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Postmark send failed: ${body}`);
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = (body.email || '').trim().toLowerCase();

  if (!email) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
  }

  try {
    const url = new URL(request.url);
    const origin = `${url.protocol}//${url.host}`;
    const generatedLink = await adminAuth.generatePasswordResetLink(email, {
      url: `${origin}/login?reset=1`,
    });
    const generatedUrl = new URL(generatedLink);
    const oobCode = generatedUrl.searchParams.get('oobCode');

    if (!oobCode) {
      throw new Error('Missing oobCode in generated reset link.');
    }

    const resetUrl = `${origin}/reset-password?oobCode=${encodeURIComponent(oobCode)}`;
    await sendResetEmail(email, resetUrl);
  } catch (err: any) {
    if (err?.code === 'auth/user-not-found') {
      return NextResponse.json({ ok: true });
    }

    console.error('Password reset request failed:', err);
    return NextResponse.json(
      { error: 'Could not send reset email right now.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
