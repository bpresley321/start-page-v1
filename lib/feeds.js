'use strict';
// Only feeds listed here can be fetched by /api/news. Add a feed by adding a line.
module.exports = {
  nyt: { title: 'New York Times', url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml' },
  txtribune: { title: 'Texas Tribune', url: 'https://www.texastribune.org/feeds/main/' },
  fwreport: { title: 'Fort Worth Report', url: 'https://fortworthreport.org/feed/' },
};
