# Flappy Cat — Istanbul (Daylight)

A tiny Flappy‑Bird–style web game where a valiant cat flies over Istanbul’s rooftops in broad daylight. Includes simple sound effects, four difficulty levels, a lightweight admin panel, and one‑tap sharing of a Story‑sized score image.

**Assets:** uses `assets/cat.png` as the hero and occasionally shows `assets/logo.png` in a subtle corner splash.

## Features
- Mobile + desktop (touch / click / space) — works on modern browsers
- Daylight cityscape background with parallax skylines
- Rare, unobtrusive logo appearance
- Beep/boop SFX and a short game‑over jingle (generated via WebAudio — no audio files)
- Difficulty levels: **easy, normal, hard, insane**
- Instant play on visit (no username, no registration)
- Game‑over modal with **“Save story image”** (1080×1920 PNG) ready for Instagram Stories
- **Admin panel** (open with `?admin=1` in the URL or press `A`):
  - Unique player count
  - Top‑10 leaderboard by score
  - Export CSV and Clear Local Stats
- **No backend required** (data persists in the current browser via `localStorage`).
  - Optional: plug in Supabase to get **global** unique‑player count & leaderboard across all visitors.

---

## Project Structure
```
.
├── index.html
├── style.css
├── game.js
├── config.js          # optional Supabase config (kept empty by default)
└── assets/
    ├── cat.png
    └── logo.png
```

## Optional: Cloud leaderboard with Supabase
By default, stats are **local to each browser** (as GitHub Pages is static hosting). If you want global stats:

1. Create a Supabase project, copy your **Project URL** and **Anon public key**.
2. Create two tables (SQL):
   ```sql
   -- players (unique player ids)
   create table if not exists players (
     id bigserial primary key,
     player_id text unique,
     inserted_at timestamp with time zone default now()
   );
   -- scores
   create table if not exists scores (
     id bigserial primary key,
     player_id text,
     score int,
     diff text,
     inserted_at timestamp with time zone default now()
   );
   -- simple read access
   alter table players enable row level security;
   alter table scores enable row level security;
   create policy "public read" on players for select using (true);
   create policy "public write" on players for insert with check (true);
   create policy "public read2" on scores for select using (true);
   create policy "public write2" on scores for insert with check (true);
   ```
3. Open `config.js` and fill:
   ```js
   window.FC_CONFIG = {
     SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
     SUPABASE_KEY: "YOUR_PUBLIC_ANON_KEY",
     TABLE_SCORES: "scores",
     TABLE_PLAYERS: "players"
   };
   ```
4. Redeploy to GitHub Pages. The admin panel will show **(cloud)** for stats if configured.

> **Note:** Without Supabase, the admin metrics are **per‑browser** only. That’s expected behavior on purely static hosting.

---

## GitHub Deployment Instructions (put this in your project README as requested)

**Example GitHub Deployment Instructions (to be written in the project):**

Place all required game files—including `index.html`, the JavaScript code, assets (such as `cat.png` and `logo.png`), and style files—into one project folder.

Go to **github.com** and create a **new repository** for your game. Do **not** initialize with a README.

On your computer, open a terminal in your project folder. Run:
```bash
git init
git add .
git commit -m "Initial commit of Flappy Cat game"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

In the GitHub repository settings, find the **“Pages”** section. Set the source to the **main** branch (usually `/root` or choose `/docs` if you store files there) and save. Wait for the site to deploy.

Your game will be accessible at:
```
https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/
```
Share this link so people can play online for free.

---

## Быстрый запуск локально (опционально)
Откройте `index.html` в браузере двойным кликом. Для корректной работы аудио в iOS первый тап должен «разблокировать» звук — просто нажмите на экран.

---

## Admin panel (how to view)
- Open `https://YOUR_USERNAME.github.io/YOUR_REPO_NAME/?admin=1`, **или** нажмите клавишу **A** во время игры.
- Для глобальных метрик подключите Supabase (см. выше). Без него панель показывает локальную статистику текущего браузера.

---

## License
MIT
