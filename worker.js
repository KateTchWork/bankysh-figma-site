/**
 * Bankysh site Worker.
 *
 * Serves the static site from ./public and handles one endpoint:
 *
 *   POST /api/subscribe   — someone submitted the signup form
 *
 * Two independent notification paths, both optional:
 *   1. console.log  — always on, visible in the dashboard under
 *                     the Worker → Observability → Logs. Costs nothing,
 *                     needs no configuration.
 *   2. email        — only if RESEND_API_KEY and NOTIFY_TO are set as
 *                     secrets/variables on the Worker.
 *
 * It ALWAYS returns 200 on a valid address, even if the email send fails.
 * The visitor must never see an error from a notification they did not ask
 * for.
 *
 * 🔴 This stores nothing. It is a notifier, not a mailing list. A list needs
 *    a privacy policy first — and the form is currently hidden on the site
 *    for exactly that reason (see SHOW_SIGNUP_FORM in public/index.html).
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/subscribe') {
      if (request.method !== 'POST') {
        return json({ ok: false, error: 'POST only' }, 405);
      }
      return handleSubscribe(request, env);
    }

    // everything else is a static file
    return env.ASSETS.fetch(request);
  }
};

async function handleSubscribe(request, env) {
  let email = '';
  let page = '';
  try {
    const body = await request.json();
    email = String(body.email || '').trim();
    page = String(body.page || '').slice(0, 120);
  } catch (err) {
    // malformed body — falls through to the validity check
  }

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return json({ ok: false }, 400);
  }

  const when = new Date().toISOString();
  const country = request.headers.get('cf-ipcountry') || '-';

  // Path 1 — always on.
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

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}
