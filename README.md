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

## Next steps
- Google sign-in and calendar (needs a Google Cloud OAuth client, one-time setup).
- Sync links and tasks across devices (needs a small database).
- Webcams shown inside the page (needs camera image addresses that allow embedding).
