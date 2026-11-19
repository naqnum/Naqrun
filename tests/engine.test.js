// Tests du moteur NaqRun : node tests/engine.test.js  → doit afficher OK
const E = require('../engine.js');
const assert = require('assert');
const ref = { km: 29.6, dplus: 637, hours: 3.45 }; // trail de Fermanville, Strava
const prof = { startLevel: 6, ref, hoursMax: 10 };
const g = (d, kind) => ({ date: d, kind: kind || 'palier', during: 1, after: 1, morning: 0, increasing: false, flags: [false, false, false] });

// Progression : 2 vertes « palier » → palier suivant ; les autres séances ne font pas monter
let s = E.computeState(prof, [g('2026-11-24'), g('2026-11-26', 'cadence'), g('2026-12-01')], '2026-12-02');
assert.equal(s.level, 7);
// Rouge → recul de 2 et repos 48 h
s = E.computeState(prof, [g('2026-11-24'), { ...g('2026-11-26'), during: 7 }], '2026-11-27');
assert.equal(s.level, 4); assert.equal(s.resting, true);
assert.ok(E.sessionsOn(prof, s, '2026-11-28', null).every(x => x.kind === 'velo'));
// Orange : même palier, série remise à zéro
s = E.computeState(prof, [g('2026-11-24'), { ...g('2026-11-26'), during: 4 }], '2026-11-27');
assert.equal(s.level, 6); assert.equal(s.streak, 0);
// Signe d'arrêt
s = E.computeState(prof, [{ ...g('2026-11-24'), flags: [true, false, false] }], '2026-11-25');
assert.equal(s.stopped, true); assert.equal(E.sessionsOn(prof, s, '2026-11-26', null).length, 0);
// Semaine type de reprise, sans renfo
s = E.computeState(prof, [], '2026-11-23');
const wk = E.repriseWeek(prof, s, '2026-11-23');
assert.deepEqual(wk.map(x => x.kind), ['palier', 'cadence', 'velo', 'rando']);
assert.equal(E.intervalsEvent(wk[2]).type, 'Ride');
console.log(wk.map(x => x.date.slice(5) + ' ' + x.title + ' ' + E.totalMin(x.blocks) + ' min').join(' | '));
assert.ok(!/\d/.test(E.intervalsText(wk[0].blocks).split('\n').map(l => l.replace(/\d+m|\d+s|Z\d|\d+x/g, '')).join('')), 'pas de chiffres dans les libellés');

// Analyse de course : Raid de l'Archange
const raid = { name: "Raid de l'Archange", date: '2027-06-17', km: 280, dplus: 3000, stages: 3, terrain: 'roulant', night: false, cutoffH: null };
const an = E.analyseRace(raid, ref, '2027-03-15');
console.log('Raid', an.kmE, 'kmE', an.ratio, 'm/km', an.profil, 'étape ≈', an.stageHours.toFixed(1), 'h', 'total', an.totalHours.toFixed(1), 'h', an.weeks, 'sem.', an.feas);
assert.equal(an.kmE, 310); assert.equal(an.feas, 'insuffisant');
const barjo = { name: 'La Barjo', date: '2027-06-17', km: 80, dplus: 1000, stages: 1, terrain: 'roulant', cutoffH: 16 };
const ab = E.analyseRace(barjo, ref, '2026-11-23');
console.log('Barjo', ab.kmE, 'kmE', ab.totalHours.toFixed(1), 'h, marge', ab.margin.toFixed(1), 'h,', ab.weeks, 'sem.', ab.feas);

// Programme
const p2 = { ...prof, switchDate: '2027-02-15' };
s = E.computeState(p2, [], '2027-02-16');
assert.equal(s.mode, 'ultra');
const P = E.buildProgram(p2, s, barjo);
P.weeks.forEach(w => console.log(w.i, w.monday, w.block, w.hours + 'h', w.dplus + 'm', w.choc ? 'CHOC' : '', w.light ? 'allégée' : '', w.prepRace ? 'PREP' : '', w.sessions.map(x => x.date.slice(5) + ' ' + x.title + ' ' + Math.round(E.totalMin(x.blocks))).join(' | ')));
console.log('jalons', P.gates.map(x => x.date + ' ' + x.c));
assert.ok(P.weeks.every(w => w.sessions.every(x => x.kind !== 'renfo')));
const P3 = E.buildProgram(p2, s, raid);
console.log('raid chocs', P3.weeks.filter(w => w.choc).map(w => w.monday + ' ' + w.sessions.filter(x=>x.kind==='longue').map(x=>Math.round(E.totalMin(x.blocks))).join('/')));
// rouge en ultra → retour reprise
s = E.computeState(p2, [{ ...g('2027-02-20', 'longue'), during: 7 }], '2027-02-21');
assert.equal(s.mode, 'reprise'); assert.equal(s.level, 10);
// Projection
s = E.computeState(prof, [], '2026-11-19');
const pr = E.projection(prof, s, '2026-11-19', barjo, 40);
console.log('projection', pr.switchDate, pr.weeks.map(w => w.monday.slice(5) + ':' + w.mode[0] + (w.level || w.block || '') + ':' + Math.round(w.minutes / 6) / 10 + 'h').join(' '));
assert.ok(pr.weeks.some(w => w.mode === 'programme'));
// Toutes les étapes en temps (jamais de distance)
pr.weeks.forEach(w => w.sessions.forEach(x => x.blocks.forEach(b => (b.rep ? b.steps : [b]).forEach(st => assert.ok(st.min > 0)))));
console.log('OK');
