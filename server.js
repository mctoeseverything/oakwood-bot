require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const { addMember } = require('./src/utils/memberStore');

const app = express();

const {
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI,
  GUILD_ID,
  VERIFIED_ROLE_ID,
  BOT_TOKEN,
} = process.env;

const PORT = process.env.VERIFY_PORT || 3001;

// ── Step 1: Redirect user to Discord OAuth2 ──────────────────────────────
app.get('/verify', (req, res) => {
  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    response_type: 'code',
    scope:         'identify',
  });
  res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

// ── Step 2: Discord redirects back with a code ───────────────────────────
app.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.send('<h2>❌ No code provided.</h2>');

  try {
    // Exchange code for access token
    const tokenRes = await axios.post(
      'https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  REDIRECT_URI,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token } = tokenRes.data;

    // Fetch Discord user info
    const userRes = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const { id, username } = userRes.data;

    // Save to DB (or retrieve existing record)
    const { member, isNew } = addMember(id, username);

    // Assign verified role via Discord REST API (no need for bot.js import)
    if (VERIFIED_ROLE_ID && GUILD_ID) {
      try {
        await axios.put(
          `https://discord.com/api/guilds/${GUILD_ID}/members/${id}/roles/${VERIFIED_ROLE_ID}`,
          {},
          { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
        );
      } catch (roleErr) {
        console.error('[Verify] Failed to assign role:', roleErr.response?.data ?? roleErr.message);
      }
    }

    const heading  = isNew ? '✅ Verified!' : '✅ Already Verified';
    const subtext  = isNew
      ? `You've been successfully verified and assigned your Member ID.`
      : `You were already verified. Here are your details.`;

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Oakwood Shopping — Verified</title>
          <style>
            body { font-family: sans-serif; background: #1e1f22; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: #2b2d31; border-radius: 12px; padding: 40px 48px; max-width: 420px; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.4); }
            h2 { margin: 0 0 8px; font-size: 1.6rem; }
            p  { color: #b5bac1; margin: 6px 0; }
            .id { background: #1e1f22; border-radius: 8px; padding: 12px 20px; margin: 20px 0; font-size: 1.4rem; font-weight: bold; letter-spacing: 2px; color: #5865f2; }
            .close { margin-top: 16px; font-size: 0.85rem; color: #6d6f78; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>${heading}</h2>
            <p>${subtext}</p>
            <div class="id">${member.member_id}</div>
            <p>Welcome, <b>${username}</b></p>
            <p class="close">You can close this tab.</p>
          </div>
        </body>
      </html>
    `);

    console.log(`[Verify] ${isNew ? 'New' : 'Returning'} member: ${username} (${id}) → ${member.member_id}`);

  } catch (err) {
    console.error('[Verify] OAuth error:', err.response?.data ?? err.message);
    res.send('<h2>❌ Something went wrong during verification. Please try again.</h2>');
  }
});

app.listen(PORT, () => {
  console.log(`[Verify] OAuth2 server running on http://localhost:${PORT}`);
});