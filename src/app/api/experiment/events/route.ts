import { adminDb } from '@/lib/firebaseAdmin';
import { readState } from '@/lib/experiment';
import { publicState } from '@/lib/experimentServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Stream only the public projection. Private ledger and payer data never leave
// the server. Firestore publishes a snapshot as soon as accounting commits.
export async function GET(request: Request) {
  const encoder = new TextEncoder();
  let stop = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let unsubscribe = () => {};
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let expiry: ReturnType<typeof setTimeout> | undefined;
      stop = () => {
        if (closed) return;
        closed = true;
        unsubscribe(); clearInterval(heartbeat); clearTimeout(expiry);
        request.signal.removeEventListener('abort', stop);
        try { controller.close(); } catch { /* Consumer cancellation already closed the stream. */ }
      };
      const send = (text: string) => { if (!closed) controller.enqueue(encoder.encode(text)); };
      request.signal.addEventListener('abort', stop, { once: true });
      if (request.signal.aborted) { stop(); return; }
      send('retry: 1000\n\n');
      unsubscribe = adminDb.collection('headlineExperiment').doc('current').onSnapshot(snapshot => {
        send(`event: totals\ndata: ${JSON.stringify(publicState(readState(snapshot.data())))}\n\n`);
      }, () => stop());
      heartbeat = setInterval(() => send(': keepalive\n\n'), 10000);
      // Reconnect periodically so settings and host deployments refresh too.
      expiry = setTimeout(stop, 300000);
    },
    cancel() { stop(); },
  });
  return new Response(stream, { headers: {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'private, no-cache, no-store, no-transform',
    'X-Accel-Buffering': 'no',
  } });
}
