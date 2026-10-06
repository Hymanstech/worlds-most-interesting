import type { MetadataRoute } from 'next';
export default function sitemap(): MetadataRoute.Sitemap {
  return ['', '/how-it-works', '/terms', '/privacy', '/contact'].map(path => ({ url: `https://www.worldsmostinteresting.com${path}`, changeFrequency: path ? 'monthly' as const : 'hourly' as const, priority: path ? 0.3 : 1 }));
}
