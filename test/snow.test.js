'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseSnow } = require('../lib/snow');

const PAGE = `<html><head><script>var x="99″ 24 Hr";</script></head><body>
<table class="hdr"><tr><td>3"</td><td>24 Hr</td><td>4%</td><td>Open</td></tr></table>
<section><h2>Snow Report</h2>
<div><span class="v">3&#8243;</span><span>24 Hr</span></div>
<div><span class="v">3&Prime;</span><span>48 Hr</span></div>
<div><span class="v">7″</span><span>7 Day</span></div>
<div><span class="v">14″</span><span>Base Depth</span></div>
<div><span class="v">26″</span><span>Season Total</span></div>
<p>Official snow totals are recorded at 4:30 AM and 4:30 PM.</p>
<div><strong>5 of 114</strong><br>Trails Open</div><div><strong>1 of 12</strong><br>Lifts Open</div>
<h3>Frontside</h3><p>5/57 Trails Open</p><h3>Purgatory Express #1</h3><p>Hours: 9am-4pm</p><p>Open</p>
</section></body></html>`;

test('snow: reads totals, lifts and trails from the conditions page', () => {
  assert.deepStrictEqual(parseSnow(PAGE), {
    new24: 3, new48: 3, new7d: 7, base: 14, season: 26, lifts: { open: 1, total: 12 }, trails: { open: 5, total: 114 },
  });
});

test('snow: off-season page gives no report instead of junk', () => {
  assert.strictEqual(parseSnow('<p>Thank you for a great winter season. Winter operations are now closed. Open 7 days a week this summer.</p>'), null);
  assert.strictEqual(parseSnow(''), null);
});

test('snow: handles "in" units and slash counts', () => {
  const r = parseSnow('<b>12 in</b> 24 Hours <b>40 in.</b> Base Depth <b>8/12</b> Lifts Open');
  assert.deepStrictEqual([r.new24, r.base, r.lifts], [12, 40, { open: 8, total: 12 }]);
});

test('snow: whole-mountain count wins over area counts listed first', () => {
  const r = parseSnow('<p>3″ 24 Hr</p><h3>Frontside</h3><p>5/57 Trails Open</p><h3>Backside</h3><p>0/51 Trails Open</p><p>1/9 Lifts Open</p><div>5 of 114</div><div>Trails Open</div><div>1 of 12 Lifts Open</div>');
  assert.deepStrictEqual([r.trails, r.lifts], [{ open: 5, total: 114 }, { open: 1, total: 12 }]);
});

test('snow: dial counts with a percent or other text between the number and the label', () => {
  const page = `<div>0″</div><div>24 Hr</div><div>14″</div><div>Base Depth</div>
   <div class="dial"><svg><circle/></svg><span>11</span><span>of 114</span><span class="pct">10%</span></div><h4>Trails Open</h4>
   <div class="dial"><span>2</span><span>of 12</span><span>17%</span></div><h4>Lifts Open</h4>
   <h3>Frontside</h3><p>11/57 Trails Open</p><h3>Backside</h3><p>0/51 Trails Open</p>
   <h3>Purgatory Express #1</h3><p>Hours: 9am-4pm 1 of 2 chairs</p>`;
  const r = parseSnow(page);
  assert.deepStrictEqual([r.trails, r.lifts, r.new24, r.base], [{ open: 11, total: 114 }, { open: 2, total: 12 }, 0, 14]);
});
