# Halqa — Setup Guide

Total time: ~25 minutes. No coding required.

---

## STEP 1: Create Supabase account (5 min)

1. Go to https://supabase.com and click **Start your project**
2. Sign up with Google or email
3. Click **New Project**
4. Name it `halqa`, choose any region, set a password (save it)
5. Wait ~2 minutes for the project to launch

---

## STEP 2: Set up the database (3 min)

1. In your Supabase project, click **SQL Editor** in the left sidebar
2. Click **New Query**
3. Open the file `SUPABASE_SCHEMA.sql` from this folder
4. Copy everything and paste it into the SQL Editor
5. Click **Run**
6. You should see "Success. No rows returned"

---

## STEP 3: Get your Supabase keys (2 min)

1. In Supabase, go to **Settings → API**
2. Copy your **Project URL** (looks like https://xxxx.supabase.co)
3. Copy your **anon public** key (long string starting with eyJ...)

---

## STEP 4: Create Vercel account & deploy (10 min)

1. Go to https://github.com and create a free account if you don't have one
2. Go to https://vercel.com and sign up with GitHub
3. In Vercel, click **Add New → Project**
4. Click **Import Third-Party Git Repository**
5. Upload this project folder (or push it to a GitHub repo first)

### Easiest method — deploy via GitHub:
1. Go to https://github.com/new and create a repo called `halqa`
2. Upload all files from this folder to the repo
3. In Vercel, import that GitHub repo
4. Before clicking Deploy, click **Environment Variables** and add:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Project URL from Step 3
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon key from Step 3
5. Click **Deploy**
6. Wait ~2 minutes. Vercel gives you a URL like `halqa.vercel.app`

---

## STEP 5: Add to iPhone home screen (1 min)

1. Open Safari on your iPhone
2. Go to your Vercel URL (e.g. https://halqa.vercel.app)
3. Tap the **Share** button (box with arrow)
4. Tap **Add to Home Screen**
5. Name it **Halqa** and tap **Add**

It now appears on your home screen like a native app. Your data is stored in Supabase — it will never be lost, even if you clear Safari, switch phones, or open it on a laptop.

---

## You're done!

- Add villages from the home screen
- Tap a village to add contacts, election results, dynamics, schemes, and notes
- Everything saves automatically to your database

---

## Need to update the app later?

Just push changes to your GitHub repo — Vercel redeploys automatically. Your data in Supabase is never affected by app updates.
