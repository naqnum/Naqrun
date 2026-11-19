// Tests du moteur NaqRun : node tests/engine.test.js  → doit afficher OK
const E = require('../engine.js');
const assert = require('assert');
const ref = { km: 29.6, dplus: 637, hours: 3.45 }; // trail de Fermanville, Strava
const prof = { startLevel: 8, ref, hoursMax: 10 };
const g = (d, kind) => ({ date: d, kind: kind || 'palier', during: 1, after: 1, morning: 0, increasing: false, flags: [false, false, false] });

// Progression : 2 vertes « palier » → palier suivant ; les autres séances ne font pas monter
let s = E.computeState(prof, [g('2026-11-24'), g('2026-11-26', 'cadence'), g('2026-12-01')], '2026-12-02');
assert.equal(s.level, 9);
// Rouge → recul de 2 et repos 48 h
s = E.computeState(prof, [g('2026-11-24'), { ...g('2026-11-26'), during: 7 }], '2026-11-27');
assert.equal(s.level, 6); assert.equal(s.resting, true);
assert.ok(E.sessionsOn(prof, s, '2026-11-28', null).every(x => x.kind === 'velo'));
// Orange : même palier, série remise à zéro
s = E.computeState(prof, [g('2026-11-24'), { ...g('2026-11-26'), during: 4 }], '2026-11-27');
assert.equal(s.level, 8); assert.equal(s.streak, 0);
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
assert.equal(s.mode, 'reprise'); assert.equal(s.level, 12);
// Projection
s = E.computeState(prof, [], '2026-11-19');
const pr = E.projection(prof, s, '2026-11-19', barjo, 40);
console.log('projection', pr.switchDate, pr.weeks.map(w => w.monday.slice(5) + ':' + w.mode[0] + (w.level || w.block || '') + ':' + Math.round(w.minutes / 6) / 10 + 'h').join(' '));
assert.ok(pr.weeks.some(w => w.mode === 'programme'));
// Toutes les étapes en temps (jamais de distance)
pr.weeks.forEach(w => w.sessions.forEach(x => x.blocks.forEach(b => (b.rep ? b.steps : [b]).forEach(st => assert.ok(st.min > 0)))));
// Rythme dynamique : le footing cadence vert compte aussi
const dynp = { ...prof, rythme: 'dynamique' };
s = E.computeState(dynp, [g('2026-11-24'), g('2026-11-26', 'cadence')], '2026-11-27');
assert.equal(s.level, 9);
s = E.computeState(prof, [g('2026-11-24'), g('2026-11-26', 'cadence')], '2026-11-27');
assert.equal(s.level, 8);
const s0 = E.computeState(dynp, [], '2026-11-19');
const prd = E.projection(dynp, s0, '2026-11-19', barjo, 40);
const prp = E.projection(prof, E.computeState(prof, [], '2026-11-19'), '2026-11-19', barjo, 40);
console.log('prudent : programme', prp.switchDate, '| dynamique : base', prd.baseDate, 'programme', prd.switchDate);
assert.ok(prd.switchDate < prp.switchDate);
const fd = E.analyseRace(barjo, ref, E.prepStart(dynp, s0, '2026-11-19'));
const fp = E.analyseRace(barjo, ref, E.prepStart(prof, E.computeState(prof, [], '2026-11-19'), '2026-11-19'));
console.log('Barjo : prudent', fp.weeks, 'sem.', fp.feas, '| dynamique', fd.weeks, 'sem.', fd.feas);
const rd = E.analyseRace(raid, ref, E.prepStart(dynp, s0, '2026-11-19'));
console.log('Raid : dynamique', rd.weeks, 'sem.', rd.feas);
// Chaque marche de palier ≤ 10 % (sauf course/marche → continu)
for (let i = 4; i < E.LEVELS.length; i++) assert.ok(E.LEVELS[i].run / E.LEVELS[i - 1].run <= 1.115, 'palier ' + (i + 1));
// Semaine de consolidation : 4e semaine du cycle, pas de montée
const cp = { ...prof, cycleStart: '2026-11-16' };
assert.equal(E.isConsolidation(cp, '2026-12-08'), true); assert.equal(E.isConsolidation(cp, '2026-12-15'), false);
s = E.computeState(cp, [g('2026-12-08'), g('2026-12-10')], '2026-12-11');
assert.equal(s.level, 8);
const cw = E.repriseWeek(cp, { level: 10 }, '2026-12-07');
assert.equal(cw[0].level, 9); assert.ok(cw[0].consolidation);
const prc = E.projection({ ...cp, rythme: 'dynamique' }, E.computeState(cp, [], '2026-11-19'), '2026-11-19', null, 40);
console.log('dynamique + consolidation : base', prc.baseDate, 'programme', prc.switchDate);
// ancienne échelle → nouvelle
assert.equal(E.LADDER_V1[6], 8); assert.equal(E.LEVELS[7].run, 40);
console.log('OK');
