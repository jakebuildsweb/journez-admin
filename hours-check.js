const fs = require('fs');
const assert = require('assert');

const src = fs.readFileSync(process.argv[2] || 'locations.js', 'utf8');
const grab = name => {
  const i = src.indexOf(`function ${name}(`);
  if (i < 0) throw new Error(`missing ${name}`);
  let d = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1);
  }
};
const ctx = {};
new Function('ctx', ['parseHourStr','to12Hour','dayHours','normalizeHours','hoursFromCSVRow']
  .map(grab).join('\n') +
  `\nconst CSV_DAY_COLS=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
   const DAY_SHORT_TO_FULL={mon:'monday',tue:'tuesday',wed:'wednesday',thu:'thursday',fri:'friday',sat:'saturday',sun:'sunday'};
   const DAY_FULL_TO_SHORT=Object.fromEntries(Object.entries(DAY_SHORT_TO_FULL).map(([k,v])=>[v,k]));
   Object.assign(ctx,{parseHourStr,to12Hour,dayHours,normalizeHours,hoursFromCSVRow});`)(ctx);

const { dayHours, normalizeHours, hoursFromCSVRow } = ctx;
const DAYS = ['mon','tue','wed','thu','fri','sat','sun'];

// collectHours reimplemented over dayHours exactly as locations.js does, driven by fake DOM state
function collectHours(state) {
  const hours = {}; let anyOpen = false;
  const FULL = {mon:'monday',tue:'tuesday',wed:'wednesday',thu:'thursday',fri:'friday',sat:'saturday',sun:'sunday'};
  DAYS.forEach(d => {
    const s = state[d];
    if (s) anyOpen = true;
    hours[FULL[d]] = s ? dayHours(s[0], s[1]) : dayHours(null, null);
  });
  return anyOpen ? hours : null;
}

// 1. canonical shape from the editor
const saved = collectHours({ mon: ['09:00','17:00'], sun: ['00:00','23:59'] });
assert.deepStrictEqual(saved.monday, { open: '9:00 AM', close: '5:00 PM' });
assert.deepStrictEqual(saved.saturday, { open: 'Closed', close: 'Closed' });
assert.deepStrictEqual(saved.sunday, { open: 'Open 24 Hours', close: '' });
assert.strictEqual(Object.keys(saved).length, 7);

// 2. the reported live regression: CSV import -> edit modal -> save unchanged must round-trip
const imported = hoursFromCSVRow({
  hours_monday: '9:00 AM-5:00 PM', hours_tuesday: 'Closed', hours_wednesday: 'Closed',
  hours_thursday: 'Closed', hours_friday: 'Closed', hours_saturday: 'Closed',
  hours_sunday: 'Open 24 Hours'
});
const shown = normalizeHours(imported);
const resaved = collectHours(Object.fromEntries(DAYS.map(d => [d, shown[d] ? [shown[d].open, shown[d].close] : null])));
assert.deepStrictEqual(resaved, imported, 'edit-modal save changed the stored shape');

// 3. both writers agree on every day form
assert.deepStrictEqual(
  hoursFromCSVRow({ hours_monday: '12:00 AM-11:59 PM' }).monday,
  dayHours('00:00','23:59')
);

console.log('hours shape OK');
