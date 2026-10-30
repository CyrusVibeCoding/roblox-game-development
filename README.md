# Chicken Farm HQ

Private team dashboard for our Roblox chicken farm game. Static site (GitHub Pages) + Supabase for logins and data.

## Files
- `index.html` landing page with live Roblox visit count
- `login.html` team login

The visit count uses Roblox universe `10769042979` through the public games API.
If the API is unavailable, both pages use `FALLBACK_VISITS` from `config.js`.
