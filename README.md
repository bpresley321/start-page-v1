# Start page

A personal start page: editable link groups, tasks, live weather for any city, and live headlines from RSS feeds.
No dependencies, no build step.

## What is in here
- `index.html` is the whole page. Links, groups, tasks, city and text size save in the browser (localStorage). Settings has a copy-and-paste backup.
- `api/news.js` fetches an allowed RSS feed and returns headlines. Feeds are listed in `lib/feeds.js` (NYT and Fort Worth Report). Add a feed by adding a line there, then a card name in `NEWS` in `index.html`.
- `api/weather.js` looks up a city with Open-Meteo (free, no key) and returns current conditions plus a 5-day forecast.
- `lib/` holds the RSS parser and weather helpers. `test/` has tests: `npm test`.

## Layout
Column 1 is icon links, tasks and weather. Column 2 is news (6 stories per feed). Column 3 is your link groups. Column 4 is spare. In Edit mode each group has a Column picker and an icons/list toggle.

## Header photo
The banner is a drawn mountain illustration. To use your own photo, add a file named `header.jpg` (a wide image, about 2000 px across) next to `index.html`. It replaces the illustration automatically.

## Deploy on Vercel (works from an iPad)
1. In Safari, sign in at vercel.com with GitHub.
2. Add New, then Project, then pick `start-page-v1`.
3. Leave every setting at its default and press Deploy.
4. Open the new address and use Share, then Add to Home Screen.

Every push to the main branch redeploys automatically.

## Sync across devices
`api/data.js` saves the page's data (links, groups, tasks, settings) in an Upstash Redis database so every device shows the same page.
- Vercel needs the Upstash Redis database connected to the project (it supplies `KV_REST_API_URL` and `KV_REST_API_TOKEN`, or the `UPSTASH_REDIS_REST_*` equivalents) and a passcode in an environment variable named `HOME_PASSWORD` (`SYNC_PASSCODE` also works). Redeploy after adding variables.
- On each device, open Settings, type the passcode, and tap Connect sync. It is remembered on that device.
- The newest change wins. A device that has never synced adopts what is already saved, so connect the device with your best links first.
- Without a passcode on a device, the page works as before, saving only in that browser.

## Next steps
- Google sign-in and calendar (needs a Google Cloud OAuth client, one-time setup).
- Webcams shown inside the page (needs camera image addresses that allow embedding).

## Weather tabs
The Weather card has one tab per city (up to 6). Tap a tab to switch, **+** to add a city (use `City, ST`), and in Edit mode tap **×** on a tab to remove it. The list syncs with everything else; each city's forecast is cached for 5 minutes.

## Google sign-in
Until the three settings below exist, the page uses the sync passcode as before. Once they're set (and the project redeployed), the page shows a "Sign in with Google" screen, only the emails in `ALLOWED_EMAILS` can get in, the passcode stops working, and sync uses the sign-in instead. A sign-in lasts 60 days per device.

1. console.cloud.google.com → create a project → **Google Auth Platform** → Get started: app name, your email, Audience **External**. Under **Audience**, add your Gmail as a test user.
2. **Clients** → Create client → *Web application* → Authorized redirect URI: `https://YOUR-SITE/api/auth/callback` (Settings on the page shows the exact address). Copy the client ID and secret.
3. Vercel → project → Settings → Environment Variables: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOWED_EMAILS` (your Gmail). Then Deployments → Redeploy.

Only the `openid email` scopes are requested, so Google's app verification isn't needed. Moving to a new domain later: add its callback address as another redirect URI.

## Calendar
The Calendar card (top of column 4) shows the next 7 days from up to 9 calendars, only when you're signed in with Google.
In Google Calendar (on a computer): Settings → pick the calendar → **Integrate calendar** → copy the **Secret address in iCal format** (your own calendars) or **Public address in iCal format** (public ones). Then in Vercel add `CALENDAR_1`, `CALENDAR_2`, … with those addresses and redeploy. The card uses each calendar's own name; to use a different one, write `Name|address`.
Calendars are re-read every 10 minutes. Repeating events, cancellations and moved events are handled.

## Daily backups
The first save each day copies your page as it stood (start of that day) to a backup kept 31 days. Settings → Daily backups lists them; Restore replaces your page on every device. A restore first saves the current page as "Just before the last restore", so it can be undone.

## Purgatory snow report
The webcam card shows new snow, base, season total, lifts and trails, read from purgatory.ski's conditions page every 15 minutes (lib/snow.js). Off-season, or if the resort changes its page, the card says so and the Full report link still works.

## Storm risk badge
The Weather card shows the Storm Prediction Center's severe-weather outlook (today and tomorrow) for the open city tab, from SPC's categorical outlook GeoJSON (lib/storm.js). It refreshes with the weather; tapping it opens SPC's outlook page. US cities only.

## Monitoring tab
`#monitoring` shows a Conditions table from `/api/monitor` (lib/monitor.js), refreshed every 10 minutes and whenever the open weather city changes. The tab shows a count of yellow/red rows.
| Row | Source | Green / yellow / red |
| --- | --- | --- |
| NWS alerts (open weather city) | api.weather.gov active alerts | none / watch or advisory / warning |
| Storm risk (open weather city) | SPC Day 1–2 categorical outlook | ≤ Marginal / Slight / Enhanced+ |
| Lake Weatherford | waterdatafortexas.org (30-day CSV; page title as fallback) | ≥ 80% / 50–80% / < 50% |
| Air quality, DFW | Open-Meteo US AQI (model) | ≤ 50 / 51–100 / > 100, now or next 24 h |
| DFW airport | FAA NAS status (nasstatus.faa.gov) | no delays / arrival-departure delays or closure / ground stop or delay program |
| UV index (open weather city) | Open-Meteo forecast (today's max; tomorrow's after 5 PM) | max < 6 / 6–7 / 8+ |
| SPY | Yahoo Finance chart data (Stooq daily CSV as fallback), delayed | up or down < 1% / down 1–2.5% / down > 2.5% on the day |

## Shopping watches
Monitoring tab → Shopping: paste a product link (optionally a target price). `/api/price` (signed-in only) reads the price from the page's schema.org Product data, then price meta tags, then Shopify's product JSON. Prices are re-checked every 3 hours while the page is open on any device; the list (with first, lowest and current price) syncs like your links. Green = at or below target, yellow = below the price when added, gray = out of stock or the store blocked the check. Home shows only the green/yellow ones.

## Header photo
Settings → Header photo: **NASA picture of the day** (default) or **Mountains** (header.jpg). `/api/apod` returns the newest Astronomy Picture of the Day image from the past week (video days and NASA's "NASA Science" stand-in entries are skipped; if the API has none, it reads the classic apod.nasa.gov/apod/apYYMMDD.html pages), cached 2 hours; `?debug=1` shows what NASA sent; the title and credit link to NASA's page. Set `NASA_API_KEY` in Vercel (free at api.nasa.gov) to avoid the shared DEMO_KEY limits. If NASA can't be reached, the mountain photo stays.

## Function count
Vercel's Hobby plan allows 12 serverless functions per deployment. Sign-in is one function (`api/auth.js`, with `vercel.json` rewriting `/api/auth/login|callback|me|logout` to it; the handlers live in `lib/handlers/`). Put new server code in an existing function or `lib/` where possible. Current count: 10.

### Unsplash option
Settings → Header photo → **Unsplash photo of the day**, with your own search words (default "mountains landscape"). One landscape photo per search per day, cropped by Unsplash to banner shape; the caption credits the photographer and Unsplash and links to the photo (their attribution rules), and the page reports the use to Unsplash as their guidelines ask. Needs `UNSPLASH_ACCESS_KEY` in Vercel (free: unsplash.com/developers → New Application → Access Key). Served by the same function as the NASA picture (`/api/apod?source=unsplash`), so it doesn't add a function.
