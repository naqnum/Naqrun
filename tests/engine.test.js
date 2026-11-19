const E = require('../engine.js');
const assert = require('assert');
const prof = {startLevel:6, raceDate:'2027-06-17', peakHours:10};
const g = d => ({date:d,during:1,after:1,morning:0,increasing:false,flags:[false,false,false]});
// 2 greens -> level 7
let s = E.computeState(prof,[g('2026-11-20'),g('2026-11-22')],'2026-11-23');
assert.equal(s.level,7); assert.equal(s.nextDate,'2026-11-24');
// red -> -2
s = E.computeState(prof,[g('2026-11-20'),{...g('2026-11-22'),during:7}],'2026-11-23');
assert.equal(s.level,4); assert.equal(s.nextDate,'2026-11-25');
// orange keeps level, resets streak
s = E.computeState(prof,[g('2026-11-20'),{...g('2026-11-22'),during:4},g('2026-11-24')],'2026-11-25');
assert.equal(s.level,6); assert.equal(s.streak,1);
// stop flag
s = E.computeState(prof,[{...g('2026-11-20'),flags:[true,false,false]}],'2026-11-21');
assert.equal(s.stopped,true);
// 3 runs / 7 days cap
s = E.computeState(prof,[g('2026-11-16'),g('2026-11-18'),g('2026-11-20')],'2026-11-21');
console.log('next after 3 in week', s.nextDate);
// pending morning
s = E.computeState(prof,[{...g('2026-11-18'),morning:null}],'2026-11-19');
console.log('provisional', s.logs[0]._provisional, s.logs[0]._v);
// next session & intervals text
console.log(JSON.stringify(E.intervalsEvent(E.nextSession(prof, s, '2026-11-19')),null,1));
console.log(E.intervalsText(E.LEVELS[10].blocks));
// ultra plan
const p2 = {...prof, switchDate:'2027-02-15'};
s = E.computeState(p2,[],'2027-02-16');
console.log('mode', s.mode);
const plan = E.buildPlan(p2, s);
plan.forEach(w=>console.log(w.i,w.monday,w.block,w.hours,w.light?'allégée':'',w.sessions.map(x=>x.date.slice(5)+' '+x.title+' '+x.min).join(' | ')));
console.log(E.intervalsText(plan[8].sessions[0].blocks));
console.log('est reprise', E.estimateOptimal(prof, E.computeState(prof,[], '2026-11-19'), '2026-11-19'));
console.log('est ultra', E.estimateOptimal(p2, s, '2027-02-16'));
console.log(E.nextSession(p2,s,'2027-02-16').title);
console.log('passage', JSON.stringify(E.passage(prof, E.computeState(prof,[],'2026-11-19'),'2026-11-19').ready));
console.log('OK');
