import type { Metadata } from 'next';
import HeadlineExperiment from '@/components/HeadlineExperiment';
import { getExperimentState, publicState } from '@/lib/experimentServer';
export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  let no = false;
  try { no = (await getExperimentState()).winner === 'no'; } catch {}
  const title = `Donald Trump is ${no ? 'NOT ' : ''}the world’s most interesting person.`;
  return { title, description: 'One crown. One word. You decide. The higher paid total controls the page.', openGraph: { title, description: 'Agree? Defend it. Disagree? Edit it.', images: [{ url: `/mockup/assets/${no ? 'mugshot.jpg' : 'portrait.png'}` }] }, twitter: { card: 'summary_large_image', title } };
}
export default async function HomePage() {
  let initialState = null;
  try { initialState = publicState(await getExperimentState()); } catch {}
  return <HeadlineExperiment initialState={initialState} />;
}
