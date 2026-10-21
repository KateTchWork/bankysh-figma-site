/**
 * POST /api/subscribe   —  Cloudflare Pages Function
 *
 * Receives an email address from the signup form and notifies someone.
 *
 * Two independent notification paths, both optional:
 *   1. console.log  — always on, visible in Cloudflare's real-time logs.
 *                     Costs nothing and needs no configuration.
 *   2. email        — only if RESEND_API_KEY and NOTIFY_TO are set as
 *                     environment variables on the Pages project.
 *
 * It ALWAYS returns 200 on a valid address, even if the email send fails.
 * The visitor must never see an error from a notification they did not ask for.
 *
 * 🔴 This stores nothing. It is a notifier, not a mailing list. If you later
 *    want a list, that needs a privacy policy first — telling people what you
 *    keep and why is not optional once you are keeping it.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function onRequestPost(context) {
  const { request, env } = context;

  let email = '';
  let page = '';
  try {
    const body = await request.json();
    email = String(body.email || '').trim();
    page = String(body.page || '').slice(0, 120);
  } catch (err) {
    // malformed body — fall through to the validity check
  }

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return json({ ok: false }, 400);
  }

  const when = new Date().toISOString();
  const country = request.headers.get('cf-ipcountry') || '-';

  // Path 1 — always. Cloudflare dashboard → the Pages project → Functions →
  // Real-time Logs. Look for lines beginning SIGNUP.
  console.log(`SIGNUP ${email} | ${when} | ${country} | ${page}`);

  // Path 2 — only when configured.
  if (env.RESEND_API_KEY && env.NOTIFY_TO) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: env.NOTIFY_FROM || 'Bankysh site <onboarding@resend.dev>',
          to: [env.NOTIFY_TO],
          subject: `New Bankysh signup — ${email}`,
          text: [
            `Email   : ${email}`,
            `Time    : ${when}`,
            `Country : ${country}`,
            `Page    : ${page || '/'}`
          ].join('\n')
        })
      });
      if (!res.ok) {
        console.log(`SIGNUP-NOTIFY-FAILED ${res.status} ${await res.text()}`);
      }
    } catch (err) {
      console.log(`SIGNUP-NOTIFY-ERROR ${err && err.message}`);
    }
  }

  return json({ ok: true });
}

// Anything that is not a POST gets a plain answer rather than a crash.
export async function onRequest(context) {
  if (context.request.method === 'POST') {
    return onRequestPost(context);
  }
  return json({ ok: false, error: 'POST only' }, 405);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}
