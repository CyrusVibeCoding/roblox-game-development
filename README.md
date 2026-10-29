# Chicken Farm HQ

Private team dashboard for our Roblox chicken farm game. Static site (GitHub Pages) + Supabase for logins and data.

## Setup
1. Supabase → SQL Editor → paste `setup.sql` → Run.
2. Supabase → Authentication → create the two user accounts. Turn off public sign-ups.
3. Push this folder to GitHub, then Settings → Pages → deploy from `main` / root.
4. Supabase → Authentication → URL Configuration → set Site URL to your GitHub Pages URL.

## Files
- `index.html` landing page (visits counter, 0 until launch)
- `login.html` team login
- `dashboard.html` + `dashboard.js` stats + task board
- `config.js` Supabase URL + anon key (public by design; never put the service_role key here)
- `setup.sql` database tables and security rules
