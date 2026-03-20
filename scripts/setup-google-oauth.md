# Google OAuth Setup — Gmail + Calendar + Tasks

## Step 1 — Create Google Cloud Project
1. Go to https://console.cloud.google.com/
2. Click "New Project"
3. Name it: **MirrorOS**
4. Click Create

## Step 2 — Enable APIs
In the project, go to **APIs & Services → Library**.
Search and enable these one by one:
- **Gmail API**
- **Google Calendar API**
- **Google Tasks API**

## Step 3 — Configure OAuth Consent Screen
1. Go to **APIs & Services → OAuth consent screen**
2. Choose **External**
3. Fill in app name: `MirrorOS`
4. Add your email as test user
5. Save and continue through all steps

## Step 4 — Create OAuth Credentials
1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth Client ID**
3. Application type: **Web application**
4. Name: `MirrorOS Local`
5. Authorized redirect URIs: `http://localhost:3000/auth/callback`
6. Click Create
7. Copy the values into `.env`:
   ```
   GOOGLE_CLIENT_ID=your_client_id_here
   GOOGLE_CLIENT_SECRET=your_client_secret_here
   ```

## Step 5 — Run the auth flow (one time only)
```bash
node scripts/google-auth.js
```
- Opens your browser
- Sign in with Google
- Click Allow
- Token saved to `config/google-token.json`
- Done! APIs will now return real data.

## Step 6 — Verify it worked
```bash
curl http://localhost:3000/api/gmail
curl http://localhost:3000/api/calendar
curl http://localhost:3000/api/tasks
```
Real data should appear (not mock).

---

## Notes
- The token in `config/google-token.json` auto-refreshes — it never expires
- `google-token.json` is gitignored — never commit it
- To revoke access: Google Account → Security → Third-party apps
