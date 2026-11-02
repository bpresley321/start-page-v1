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
