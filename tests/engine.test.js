// Tests du moteur NaqRun : node tests/engine.test.js  → doit afficher OK
const E = require('../engine.js');
const assert = require('assert');
const ref = { km: 29.6, dplus: 637, hours: 3.45 }; // trail de Fermanville, Strava
const prof = { startLevel: 10, ref, hoursMax: 10 }; // 40 min continu
const g = (d, kind) => ({ date: d, kind: kind || 'palier', during: 1, after: 1, morning: 0, increasing: false, flags: [false, false, false] });

// Progression : 2 vertes « palier » → palier suivant ; les autres séances ne font pas monter
let s = E.computeState(prof, [g('2026-11-24'), g('2026-11-26', 'cadence'), g('2026-12-01')], '2026-12-02');
assert.equal(s.level, 11);
// Rouge → recul de 2 et repos 48 h
s = E.computeState(prof, [g('2026-11-24'), { ...g('2026-11-26'), during: 7 }], '2026-11-27');
assert.equal(s.level, 8); assert.equal(s.resting, true);
assert.ok(E.sessionsOn(prof, s, '2026-11-28', null).every(x => x.kind === 'velo'));
// Orange : même palier, série remise à zéro
s = E.computeState(prof, [g('2026-11-24'), { ...g('2026-11-26'), after: 4 }], '2026-11-27');
assert.equal(s.level, 10); assert.equal(s.streak, 0);
// Signe d'arrêt
s = E.computeState(prof, [{ ...g('2026-11-24'), flags: [true, false, false] }], '2026-11-25');
assert.equal(s.stopped, true); assert.equal(E.sessionsOn(prof, s, '2026-11-26', null).length, 0);
// Semaine type de reprise, sans renfo
s = E.computeState(prof, [], '2026-11-23');
const wk = E.repriseWeek(prof, s, '2026-11-23');
assert.deepEqual(wk.map(x => x.kind), ['palier', 'cadence', 'velo', 'rando']);
// Au palier 2 × 14 : aucune course continue plus longue qu'un bloc
const w5 = E.repriseWeek({ ...prof, startLevel: 5 }, { level: 5 }, '2026-11-23');
w5.forEach(x => x.blocks.forEach(b => (b.rep ? b.steps : [b]).forEach(st => { if (st.k === 'course') assert.ok(st.min <= 14, x.title + ' ' + st.min); })));
console.log(w5.map(x => x.title + ' ' + E.totalMin(x.blocks) + ' min').join(' | '));
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
assert.equal(s.mode, 'reprise'); assert.equal(s.level, 14);
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
assert.equal(s.level, 11);
s = E.computeState(prof, [g('2026-11-24'), g('2026-11-26', 'cadence')], '2026-11-27');
assert.equal(s.level, 10);
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
for (let i = 1; i < E.LEVELS.length; i++) assert.ok(E.LEVELS[i].run / E.LEVELS[i - 1].run <= 1.115, 'palier ' + (i + 1));
// Semaine de consolidation : 4e semaine du cycle, pas de montée
const cp = { ...prof, cycleStart: '2026-11-16' };
assert.equal(E.isConsolidation(cp, '2026-12-08'), true); assert.equal(E.isConsolidation(cp, '2026-12-15'), false);
s = E.computeState(cp, [g('2026-12-08'), g('2026-12-10')], '2026-12-11');
assert.equal(s.level, 10);
const cw = E.repriseWeek(cp, { level: 10 }, '2026-12-07');
assert.equal(cw[0].level, 9); assert.ok(cw[0].consolidation);
const prc = E.projection({ ...cp, rythme: 'dynamique' }, E.computeState(cp, [], '2026-11-19'), '2026-11-19', null, 40);
console.log('dynamique + consolidation : base', prc.baseDate, 'programme', prc.switchDate);
// ancienne échelle → nouvelle
assert.equal(E.LEVELS[4].title, '2 × 14 min (2 min de marche entre)'); assert.equal(E.LEVELS[9].run, 40);
// « Orange pendant » : douleur pendant seulement
const j = d => ({ ...g(d), during: 5, after: 2, morning: 0 });
assert.equal(E.verdict(j('2026-11-24')), 'jaune');
assert.equal(E.verdict({ ...j('2026-11-24'), morning: 2 }), 'orange');
// série conservée : vert, jaune, vert → palier suivant
s = E.computeState(prof, [g('2026-11-24'), j('2026-11-26'), g('2026-12-01')], '2026-12-02');
assert.equal(s.level, 11);
// deux jaunes de suite → orange : série remise à zéro
s = E.computeState(prof, [g('2026-11-24'), j('2026-11-26'), j('2026-12-01'), g('2026-12-03')], '2026-12-04');
assert.equal(s.logs[2]._v, 'orange'); assert.equal(s.level, 10); assert.equal(s.streak, 1);
// en programme : un jaune n'allège pas la semaine, deux de suite oui
s = E.computeState(p2, [j('2027-02-20')], '2027-02-21'); assert.equal(Object.keys(s.reduce).length, 0);
s = E.computeState(p2, [j('2027-02-20'), j('2027-02-23')], '2027-02-24'); assert.equal(Object.keys(s.reduce).length, 1);
// Report et annulation de séance
s = E.computeState(prof, [], '2026-11-23');
const mp = { ...prof, moves: { '2026-11-24|palier': '2026-11-25', '2026-11-26|cadence': 'skip' } };
assert.equal(E.sessionsOn(mp, s, '2026-11-24', null).length, 0);
assert.equal(E.sessionsOn(mp, s, '2026-11-25', null)[0].kind, 'palier');
assert.equal(E.sessionsOn(mp, s, '2026-11-25', null)[0].origDate, '2026-11-24');
assert.equal(E.sessionsOn(mp, s, '2026-11-26', null).length, 0);
// Rythme limite : chaque course verte qui compte fait monter
const lim = { ...prof, rythme: 'limite' };
s = E.computeState(lim, [g('2026-11-24'), g('2026-11-26', 'cadence')], '2026-11-27');
assert.equal(s.level, 12);
const pl = E.projection(lim, E.computeState(lim, [], '2026-11-19'), '2026-11-19', null, 60);
console.log('limite : base', pl.baseDate, 'programme', pl.switchDate);
// Qualité : séance facile trop intense → pas de montée
s = E.computeState(lim, [{ ...g('2026-11-24'), rpe: 7 }], '2026-11-25');
assert.equal(s.level, 10); assert.ok(s.logs[0]._q.length);
// Plafond 30 jours : plus longue sortie 40 min → pas plus de 44 min
s = E.computeState({ ...prof, startLevel: 12 }, [], '2026-11-23', { acts: [{ date: '2026-11-18', run: true, min: 40 }] });
assert.equal(s.cap, 44);
const capped = E.sessionsOn({ ...prof, startLevel: 12 }, s, '2026-11-24', null, {});
assert.ok(E.totalMin(capped[0].blocks) <= 44.5 && capped[0].adjustments, 'plafond ' + E.totalMin(capped[0].blocks));
// Forme du matin : VFC basse sur 7 jours → séance allégée
const well = []; for (let i = 60; i >= 0; i--) well.push({ date: E.addDays('2026-11-24', -i), hrv: i < 7 ? 40 : 60 + (i % 5), rhr: 50 });
const rdy = E.readiness(well, '2026-11-24'); assert.equal(rdy.status, 'bas');
s = E.computeState(prof, [], '2026-11-23');
const light = E.sessionsOn(prof, s, '2026-11-24', null, { today: '2026-11-24', readiness: rdy });
assert.equal(light[0].level, 9); assert.ok(/allégée/.test(light[0].title));
console.log('OK');
