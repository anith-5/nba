# Deploying HoopIQ

Your app has two parts that deploy separately:

- **Frontend** (`apps/web`) → **Vercel**
- **Backend** (`services/api`) → **Render**

Deploy the **backend first** (you need its URL for the frontend), then the frontend,
then come back and update one setting on the backend.

---

## ⚠️ Read this first

`stats.nba.com` often **blocks cloud server IPs**. Your backend works on your laptop
(home internet) but some NBA API calls may time out or fail once it's on Render. If the
live site shows missing data, this is why — not a bug in the code. The AI features
(Scouting Report, GM Assistant) and anything cached will still work.

---

## Step 1 — Backend on Render

1. Go to <https://render.com> and sign up (free) with your GitHub account.
2. Click **New +** → **Blueprint**.
3. Select your `nba` repo. Render finds `render.yaml` automatically.
4. Click **Apply**. It starts building (installs Python deps — takes a few minutes).
5. Once live, open the service → **Environment** tab → add these two variables:
   - `ANTHROPIC_API_KEY` = your real Claude key (the `sk-ant-...` one)
   - `CORS_ORIGINS` = `http://localhost:5174` (temporary — you'll update it in Step 3)
6. Copy your backend URL — it looks like `https://hoopiq-api.onrender.com`.
   Test it: open `https://hoopiq-api.onrender.com/health` — you should see
   `{"status":"ok",...}`.

> **Note:** The comp database (for the Trajectory feature) rebuilds on startup and
> takes 30–60 min. On the free tier the server **sleeps after 15 min idle**, so that
> feature may be slow or restart often. Everything else works immediately.

---

## Step 2 — Frontend on Vercel

1. Go to <https://vercel.com> and sign up (free) with GitHub.
2. Click **Add New… → Project** and import your `nba` repo.
3. **Important — set the Root Directory:** click **Edit** next to Root Directory and
   choose **`apps/web`**. (Vercel then auto-detects Vite — leave build settings default.)
4. Expand **Environment Variables** and add:
   - `VITE_API_URL` = your Render backend URL from Step 1
     (e.g. `https://hoopiq-api.onrender.com`)
5. Click **Deploy**. After ~1 min you get a URL like `https://your-app.vercel.app`.

---

## Step 3 — Connect them (fix CORS)

The backend must allow your new Vercel domain to call it.

1. Back in **Render** → your service → **Environment**.
2. Edit `CORS_ORIGINS` to your Vercel URL, e.g.:
   ```
   https://your-app.vercel.app
   ```
   (You can list several, comma-separated, with no spaces.)
3. Save. Render redeploys automatically.

Now open your Vercel URL — it should look and behave like localhost. 🎉

---

## Updating later

Both hosts auto-deploy on every `git push` to `main`:
- Push → Vercel rebuilds the frontend, Render rebuilds the backend. No manual steps.

## Local development is unaffected

`apps/web/.env.local` still points at `http://localhost:8002` for local work. Vercel
uses its own `VITE_API_URL` env var, so the two don't conflict.
