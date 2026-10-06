import { NextResponse, type NextRequest } from 'next/server';

// Retain historical source/data while closing the former daily-crown product.
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path.startsWith('/api/')) {
    if (path === '/api/admin/experiment') return NextResponse.next();
    return NextResponse.json({ error: 'The daily crown product has retired. Visit the homepage for the headline experiment.' }, { status: 410 });
  }
  return NextResponse.redirect(new URL('/', request.url));
}
export const config = {
  matcher: ['/signup', '/login', '/reset-password', '/dashboard', '/setup/:path*', '/profile/:path*', '/api/payment/:path*', '/api/queue/:path*', '/api/cron/:path*', '/api/public/top-bid', '/api/auth/:path*', '/api/admin/:path*'],
};
