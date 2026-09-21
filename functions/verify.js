import { escapeHtml, getToken, html } from './_lib/verification.js'

function page(token, discordUserId) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#050505">
<title>Lost Talent Player Verification</title>
<style>
:root{color-scheme:dark;--gold:#d4aa3e;--gold2:#ffd66b;--bg:#050505;--panel:#101010;--line:#3a311b;--text:#f7f3e8;--muted:#aaa496}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 80% 10%,#d4aa3e18,transparent 28%),linear-gradient(145deg,#050505,#0a0906);color:var(--text);font-family:Inter,system-ui,sans-serif}
.card{width:min(720px,100%);padding:30px;border:1px solid #5a461a;background:linear-gradient(145deg,#12100b,#090909);box-shadow:0 30px 90px #000b;position:relative;overflow:hidden}.card:before{content:"";position:absolute;inset:0 auto auto 0;width:180px;height:2px;background:linear-gradient(90deg,var(--gold2),transparent)}
.logo{width:110px;display:block;margin:0 auto 18px;filter:drop-shadow(0 14px 24px #000) drop-shadow(0 0 16px #d4aa3e22)}
.eyebrow{color:var(--gold);font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase}.title{font-size:clamp(34px,7vw,58px);line-height:.94;margin:8px 0 12px;text-transform:uppercase}.copy{color:var(--muted);line-height:1.65}
.notice{margin:18px 0;padding:14px 15px;border-left:3px solid var(--gold);background:#17130a;color:#c7b98e;font-size:13px;line-height:1.55}
label{display:grid;gap:7px;margin:14px 0;color:#c9c1ad;font-size:12px;font-weight:700}input,select{width:100%;padding:13px;border:1px solid #433718;background:#080808;color:#fff;outline:none}input:focus,select:focus{border-color:var(--gold2);box-shadow:0 0 0 2px #d4aa3e10}
.check{display:flex;grid-template-columns:none;align-items:flex-start;gap:10px;font-weight:500;line-height:1.45}.check input{width:auto;margin-top:3px}
button{width:100%;padding:14px 18px;margin-top:9px;border:1px solid #ffe39b;background:linear-gradient(135deg,#f0cc67,#b9851e);color:#090704;font-weight:900;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}
small{display:block;margin-top:14px;color:#716b60;line-height:1.5}.id{font-family:ui-monospace,monospace;color:#d5c286}
</style>
</head>
<body><main class="card">
<img class="logo" src="/ltl-logo.webp" alt="Lost Talent League">
<div class="eyebrow">Lost Talent // Player Intent + Identity</div>
<h1 class="title">Tell us who you are.</h1>
<p class="copy">This one-time form links your Discord account to your Activision ID. Once linked, captains can register you using only your Activision ID and the bot can apply your approved roles automatically.</p>
<div class="notice"><strong>Security notice:</strong> this verification also records a privacy-preserving network fingerprint for duplicate-account review, stores the raw network address encrypted, hashes the browser signature, and records the timestamp. A match is only a staff-review signal — households, VPNs, carriers, schools, workplaces and shared networks can legitimately match.</div>
<p class="copy">Discord account: <span class="id">${escapeHtml(discordUserId)}</span></p>
<form action="/api/verification/complete" method="post">
<input type="hidden" name="token" value="${escapeHtml(token)}">
<label>Activision ID
<input name="activision_id" autocomplete="off" placeholder="Gamertag#1234567" required>
</label>
<label>What brings you to Lost Talent?
<select name="intent" required>
<option value="">Choose one</option>
<option value="league">Lost Talent League</option>
<option value="tournament">Tournaments</option>
<option value="eights">8s / Community</option>
<option value="org">Lost Talent Organization / Content</option>
<option value="other">Other</option>
</select>
</label>
<label class="check"><input type="checkbox" name="security_ack" value="yes" required><span>I understand the account-linking and duplicate-account security check described above.</span></label>
<button type="submit">Verify + Continue</button>
</form>
<small>The link expires after 15 minutes and can only be used once. Raw network information is not posted into public Discord channels.</small>
</main></body></html>`
}

function result(ok, message) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lost Talent Verification</title><style>:root{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#050505;color:#fff;font-family:system-ui;padding:24px}.c{max-width:650px;padding:30px;border:1px solid #4a3b17;background:#10100d;text-align:center}h1{color:${ok?'#ffd66b':'#ef7d7d'}}p{color:#b5afa2;line-height:1.6}</style></head><body><main class="c"><h1>${ok?'Ready to compete':'Verification unavailable'}</h1><p>${escapeHtml(message)}</p></main></body></html>`
}

export async function onRequestGet({ request, env }) {
  const rawToken = new URL(request.url).searchParams.get('token') || ''
  const token = rawToken ? await getToken(env, rawToken) : null
  if (!token) {
    return html(result(false, 'This verification link is invalid, expired, or already used. Return to Discord and request a new one.'), 400)
  }
  return html(page(rawToken, token.discord_user_id))
}
