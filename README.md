<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1Okdcjt1lR3-r2UNd-UdvnczlVYAhY4Sg

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. (Optional but recommended) Configure Google sign-in — see below.
3. Run the app:
   `npm run dev`
4. Enter your Gemini API key on the BIOS screen when prompted (keys are stored locally in your browser).

## Google Sign-In (OAuth)

The app gates the experience behind a "Sign in with Google" screen using
[Google Identity Services](https://developers.google.com/identity/gsi/web). It is a
fully client-side OAuth flow — no backend required.

**macOS quick start:** run `./scripts/setup-oauth.sh`. It installs/uses the gcloud CLI to
sign in, pick or create a project, enable the Gemini API, mint a Gemini API key, and then
opens the exact Console pages for the one step Google doesn't expose via CLI (creating the
OAuth Web client) before writing your `.env.local`.

Manual steps, if you prefer:

1. Go to the [Google Cloud Console credentials page](https://console.cloud.google.com/apis/credentials).
2. Create an **OAuth client ID** of type **Web application**.
3. Add your origins (e.g. `http://localhost:5173` for dev, plus your production URL)
   to **Authorized JavaScript origins**.
4. Copy `.env.local.example` to `.env.local` and set `VITE_GOOGLE_CLIENT_ID` to your client ID.

If `VITE_GOOGLE_CLIENT_ID` is not configured, the auth screen reports the module
offline and offers a local guest session so the app still works out of the box.

Sessions are stored locally (IndexedDB) for 24 hours; "SIGN OUT" on the BIOS screen
or a system reset clears them.
