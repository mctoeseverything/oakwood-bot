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

// ── Privacy Policy ──────────────────────────────────────────────────────────
app.get('/privacy', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Amber Corporation — Privacy Policy</title>
        <style>
          body { font-family: sans-serif; background: #1e1f22; color: #dbdee1; max-width: 720px; margin: 60px auto; padding: 0 24px; line-height: 1.7; }
          h1 { color: #fff; } h2 { color: #fff; margin-top: 32px; }
          a { color: #5865f2; } p { color: #b5bac1; }
        </style>
      </head>
      <body>
        <h1>Privacy Policy</h1>
        <p>Last updated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

        <h2>What We Collect</h2>
        <p>When you verify through Amber Corporation, we collect and store your Discord user ID, Discord username, and (once Roblox verification is enabled) your Roblox user ID and username.</p>

        <h2>How We Use It</h2>
        <p>This information is used solely to link your Discord and Roblox accounts for the purpose of granting access to the Amber Corporation Discord server. We do not sell, share, or distribute your data to any third parties.</p>

        <h2>Data Storage</h2>
        <p>Your data is stored securely and is only accessible to Amber Corporation server administrators.</p>

        <h2>Data Removal</h2>
        <p>You may request removal of your data at any time by contacting a server administrator.</p>

        <h2>Contact</h2>
        <p>For any privacy concerns, please reach out via our Discord server.</p>
      </body>
    </html>
  `);
});

// ── Terms of Service ─────────────────────────────────────────────────────────
app.get('/terms', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Amber Corporation — Terms of Service</title>
        <style>
          body { font-family: sans-serif; background: #1e1f22; color: #dbdee1; max-width: 720px; margin: 60px auto; padding: 0 24px; line-height: 1.7; }
          h1 { color: #fff; } h2 { color: #fff; margin-top: 32px; }
          a { color: #5865f2; } p { color: #b5bac1; }
        </style>
      </head>
      <body>
        <h1>Terms of Service</h1>
        <p>Last updated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

        <h2>Acceptance</h2>
        <p>By using the Amber Corporation verification system, you agree to these terms.</p>

        <h2>Use of Service</h2>
        <p>This verification system is intended solely for members of the Amber Corporation Discord server. You agree to provide accurate account information during verification.</p>

        <h2>Account Linking</h2>
        <p>By verifying, you consent to your Discord and Roblox accounts being linked in our system for the purpose of server access management.</p>

        <h2>Termination</h2>
        <p>Amber Corporation reserves the right to revoke server access at any time for violations of server rules.</p>

        <h2>Contact</h2>
        <p>For any questions, please reach out via our Discord server.</p>
      </body>
    </html>
  `);
});

// ── Step 1: Redirect user to Discord OAuth2 ──────────────────────────────
app.get('/verify', (req, res) => {
  const { token, appId } = req.query;

  // Pass token + appId through OAuth2 state so we get it back in /callback
  const state = token && appId
    ? Buffer.from(JSON.stringify({ token, appId })).toString('base64')
    : '';

  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    response_type: 'code',
    scope:         'identify',
    ...(state && { state }),
  });

  res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

// ── Step 2: Discord redirects back with a code ───────────────────────────
app.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.send('<h2>❌ No code provided.</h2>');

  // Decode state to get interaction token + appId
  let interactionToken = null;
  let appId = null;
  if (state) {
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
      interactionToken = decoded.token;
      appId = decoded.appId;
    } catch {}
  }

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

    // Save to DB
    const { member, isNew } = addMember(id, username);

    // Assign verified role
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

    // Edit the ephemeral "Verification Session Active" message to show success
    if (interactionToken && appId) {
      try {
        const successComponents = [
          {
            type: 17, // Container
            components: [
              {
                type: 10, // TextDisplay
                content: `### 🟢 Verification Successful\nThe verification process has been completed and you have been granted access to the server. Your accounts below were linked.`,
              },
              {
                type: 14, // Separator
                divider: true,
                spacing: 2,
              },
              {
                type: 10, // TextDisplay
                content: `> Discord Account: <@${id}>`,
              },
            ],
          },
        ];

        await axios.patch(
          `https://discord.com/api/v10/webhooks/${appId}/${interactionToken}/messages/@original`,
          { components: successComponents, flags: (1 << 15) },
          { headers: { 'Content-Type': 'application/json' } }
        );
      } catch (editErr) {
        console.error('[Verify] Failed to edit message:', editErr.response?.data ?? editErr.message);
      }
    }

    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Amber Corporation — Verified</title>
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
            <h2>✅ ${isNew ? 'Verified!' : 'Already Verified'}</h2>
            <p>${isNew ? "You've been successfully verified." : 'You were already verified.'}</p>
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

  // Ping self every 10 minutes to prevent Render from spinning down
  const selfUrl = process.env.VERIFY_URL;
  if (selfUrl) {
    setInterval(async () => {
      try {
        await axios.get(selfUrl);
        console.log('[Keep-Alive] Pinged verify service');
      } catch (err) {
        console.error('[Keep-Alive] Ping failed:', err.message);
      }
    }, 10 * 60 * 1000);
  }
});