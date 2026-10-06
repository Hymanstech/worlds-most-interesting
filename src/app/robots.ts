import type { MetadataRoute } from 'next';
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: ['/', '/mockup/assets/'], disallow: ['/admin', '/api/', '/mockup/', '/signup', '/login', '/setup/', '/dashboard', '/profile/'] }, sitemap: 'https://www.worldsmostinteresting.com/sitemap.xml' };
}
