/* NaqRun — moteur (logique pure, sans interface).
   Dates : chaînes locales "AAAA-MM-JJ".
   Phase 1 : reprise de charge guidée par la douleur (périostite).
   Phase 2 : programme ultra-trail orienté « finisher ». */
(function (root) {
  "use strict";

  // ---------- Dates ----------
  function parse(d) { var p = d.split("-").map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); }
  function fmt(ms) { var x = new Date(ms); return x.getUTCFullYear() + "-" + String(x.getUTCMonth() + 1).padStart(2, "0") + "-" + String(x.getUTCDate()).padStart(2, "0"); }
  function addDays(d, n) { return fmt(parse(d) + n * 86400000); }
  function diffDays(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); } // b - a
  function todayStr(now) { var x = now || new Date(); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); }
  function weekday(d) { return (new Date(parse(d)).getUTCDay() + 6) % 7; } // 0 = lundi
  function mondayOf(d) { return addDays(d, -weekday(d)); }
  var MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  var JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
  function longDate(d) { var x = new Date(parse(d)); return JOURS[weekday(d)] + " " + x.getUTCDate() + " " + MOIS[x.getUTCMonth()]; }
  function monthYear(d) { var x = new Date(parse(d)); return MOIS[x.getUTCMonth()] + " " + x.getUTCFullYear(); }
  function r5(x) { return Math.max(5, Math.round(x / 5) * 5); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  // ---------- Paliers de reprise ----------
  // Bloc : {k:"marche"|"course"|"cote"|"velo", min, label?} ou {rep:n, steps:[...]}
  var W5 = { k: "marche", min: 5, label: "Échauffement" }, C5 = { k: "marche", min: 5, label: "Retour au calme" };
  function cont(min, label) { return [W5, { k: "course", min: min, label: label || "Course facile" }, C5]; }
  var RELIEF = "Pentes douces seulement (moins de 6 %). Montées raides et descentes : en marchant.";
  // Chaque marche ≤ 10 % de la plus longue course récente (étude Garmin-RUNSAFE, BJSM 2025)
  function lvC(n, phase, run, label, note) { return { n: n, phase: phase, title: (phase >= 4 ? "Trail " + run + " min" : run + " min " + (phase === 3 ? "vallonné doux" : "continu")), run: run, blocks: cont(run, label), note: note }; }
  var LEVELS = [
    { n: 1, phase: 0, title: "5 × (4 min course / 1 min marche)", run: 20, blocks: [W5, { rep: 5, steps: [{ k: "course", min: 4 }, { k: "marche", min: 1 }] }, C5] },
    { n: 2, phase: 0, title: "4 × (5 min 30 course / 1 min marche)", run: 22, blocks: [W5, { rep: 4, steps: [{ k: "course", min: 5.5 }, { k: "marche", min: 1 }] }, C5] },
    { n: 3, phase: 0, title: "3 × (8 min course / 1 min marche)", run: 24, blocks: [W5, { rep: 3, steps: [{ k: "course", min: 8 }, { k: "marche", min: 1 }] }, C5] },
    lvC(4, 1, 27), lvC(5, 1, 30), lvC(6, 1, 33), lvC(7, 1, 36), lvC(8, 1, 40), lvC(9, 1, 44), lvC(10, 1, 48),
    lvC(11, 2, 53), lvC(12, 2, 58),
    lvC(13, 3, 64, "Course facile, vallonné doux", RELIEF), lvC(14, 3, 70, "Course facile, vallonné doux", RELIEF),
    lvC(15, 4, 77, "Trail facile", "Montées raides marchées, descentes marchées."),
    lvC(16, 4, 85, "Trail facile", "Montées raides marchées, descentes douces courues."),
    lvC(17, 4, 90, "Trail facile", "Montées raides marchées, descentes courues sans freiner fort."),
  ];
  var RELIEF_LEVEL = 13, RETURN_LEVEL = 12; // 64 min vallonné ; retour à 58 min continu après un rouge en programme
  // Ancienne échelle (v1/v2, 15 paliers) → nouvelle
  var LADDER_V1 = [0, 1, 2, 3, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
  var MAX_LEVEL = LEVELS.length;
  var PHASES = ["Repli course/marche", "Continu sur le plat", "Volume", "Relief doux", "Trail"];
  var CADENCE = "Cadence visée : 165 à 170 pas/min (alerte cadence sur la Fenix).";

  // ---------- Verdict d'une séance de course ----------
  // Seuils périostite : vert ≤ 3/10 pendant et après, rien le lendemain.
  function verdict(log) {
    if (log.flags && log.flags.some(Boolean)) return "stop";
    var m = log.morning;
    if (log.during >= 6 || log.after >= 6 || log.increasing || (m != null && m >= 4)) return "rouge";
    if (log.during >= 4 || log.after >= 4 || (m != null && m >= 2)) return "orange";
    return "vert";
  }

  // ---------- Semaines de consolidation ----------
  // Toutes les 4 semaines : pas de montée de palier, ≈ 25 % de volume en moins (cycle de remodelage osseux ≈ 3 semaines).
  function isConsolidation(profile, date) {
    if (!profile.cycleStart) return false;
    var k = Math.floor(diffDays(mondayOf(profile.cycleStart), mondayOf(date)) / 7);
    return k >= 0 && k % 4 === 3;
  }

  // ---------- Rejouer l'historique ----------
  function computeState(profile, logs, today) {
    var s = { mode: "reprise", level: profile.startLevel || 6, streak: 0, stopped: false, lastDate: null, lastVerdict: null, restUntil: null, ultraStart: null, reduce: {}, events: [], returned: false };
    var sorted = (logs || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    sorted.forEach(function (log) {
      var v = verdict(log);
      log._v = v; log._provisional = log.morning == null;
      s.lastDate = log.date; s.lastVerdict = v;
      if (profile.switchDate && s.mode === "reprise" && !s.returned && log.date >= profile.switchDate) { s.mode = "ultra"; s.ultraStart = profile.switchDate; }
      if (v === "stop") {
        s.stopped = !(profile.clearedStop && profile.clearedStop >= log.date);
        if (s.mode === "ultra") { s.mode = "reprise"; s.returned = true; s.level = RETURN_LEVEL; } else s.level = Math.max(1, Math.min(s.level, MAX_LEVEL) - 2);
        s.streak = 0; s.restUntil = addDays(log.date, 2); s.events.push({ date: log.date, t: "Signe d'arrêt" }); return;
      }
      if (v === "rouge") {
        if (s.mode === "ultra") { s.mode = "reprise"; s.returned = true; s.level = RETURN_LEVEL; s.events.push({ date: log.date, t: "Rouge : retour en reprise (58 min continu)" }); }
        else { s.level = Math.max(1, Math.min(s.level, MAX_LEVEL) - 2); s.events.push({ date: log.date, t: "Rouge : recul de 2 paliers" }); }
        s.streak = 0; s.restUntil = addDays(log.date, 2); return;
      }
      if (s.mode === "ultra") { if (v === "orange") s.reduce[addDays(mondayOf(log.date), 7)] = true; return; }
      if (v === "orange") { s.streak = 0; return; }
      // vert : seules les séances « palier » font monter
      // rythme « dynamique » : le footing cadence vert compte aussi → jusqu'à un palier par semaine
      if (isConsolidation(profile, log.date)) return;
      if (log.kind === "palier" || log.kind == null || (profile.rythme === "dynamique" && log.kind === "cadence")) {
        s.streak++;
        if (s.streak >= 2 && s.level <= MAX_LEVEL) { s.level++; s.streak = 0; s.events.push({ date: log.date, t: "Palier suivant" }); }
      }
    });
    if (profile.switchDate && s.mode === "reprise" && !s.returned && today >= profile.switchDate) { s.mode = "ultra"; s.ultraStart = profile.switchDate; }
    s.logs = sorted;
    s.done = s.level > MAX_LEVEL;
    s.resting = !!(s.restUntil && today <= s.restUntil);
    return s;
  }

  // ---------- Test de passage ----------
  function passage(profile, state, today) {
    var recent = state.logs.filter(function (l) { return diffDays(l.date, today) <= 21; });
    var allGreen = recent.length >= 6 && recent.every(function (l) { return l._v === "vert" && !l._provisional; });
    var items = [
      { k: "paliers", label: "Paliers validés jusqu'au trail de 90 min", ok: state.done, required: true },
      { k: "vert", label: "3 semaines au vert (6 séances ou plus)", ok: allGreen, required: true, detail: recent.length + " séance(s) sur 21 jours" },
      { k: "hop", label: "15 sauts sur une jambe sans douleur, de chaque côté", ok: !!profile.hop, required: true, manual: true },
      { k: "heel", label: "25 montées sur une pointe de pied sans douleur, de chaque côté", ok: !!profile.heel, required: true, manual: true },
      { k: "kine", label: "Feu vert du kiné ou du médecin", ok: !!profile.kine, required: false, manual: true },
    ];
    return { items: items, ready: items.every(function (i) { return !i.required || i.ok; }) };
  }

  // ---------- Séances types ----------
  function sess(date, kind, title, blocks, extra) { return Object.assign({ date: date, kind: kind, title: title, blocks: blocks, sport: kind === "velo" ? "Ride" : kind === "renfo" ? null : "Run", note: "" }, extra || {}); }
  function easy(min, label) { return [W5, { k: "course", min: Math.max(10, r5(min - 10)), label: label || "Course facile" }, C5]; }
  function bike(min) { return [{ k: "velo", min: r5(min), label: "Vélo ou elliptique facile" }]; }
  function rando(min, runMin) {
    var walk = Math.max(20, r5((min - runMin) / 2));
    return [{ k: "marche", min: walk, label: "Rando, montées marchées vite" }, { k: "course", min: r5(runMin), label: "Course facile sur portion plate" }, { k: "marche", min: walk, label: "Rando, descentes marchées" }];
  }
  function hikeRepeats(min, reps) {
    var main = reps * 7;
    return [{ k: "course", min: 15, label: "Échauffement en course facile" }, { rep: reps, steps: [{ k: "cote", min: 4, label: "Montée de la côte en marche rapide" }, { k: "marche", min: 3, label: "Descente marchée" }] }, { k: "course", min: Math.max(10, r5(min - 15 - main)), label: "Retour au calme" }];
  }
  function strides(min) { return [W5, { k: "course", min: Math.max(10, r5(min - 18)), label: "Course facile" }, { rep: 6, steps: [{ k: "course", min: 0.5, label: "Cadence haute, relâché" }, { k: "course", min: 1, label: "Course facile" }] }, C5]; }
  function totalMin(blocks) {
    return blocks.reduce(function (t, b) { return t + (b.rep ? b.rep * b.steps.reduce(function (u, st) { return u + st.min; }, 0) : b.min); }, 0);
  }

  // Semaine type de reprise : mardi palier, jeudi cadence, vendredi vélo, samedi rando-course
  function repriseWeek(profile, state, monday) {
    var cons = isConsolidation(profile, monday), f = cons ? 0.75 : 1;
    var lv = LEVELS[Math.max(1, Math.min(state.level, MAX_LEVEL) - (cons ? 1 : 0)) - 1], d = function (n) { return addDays(monday, n); };
    var cad = Math.max(20, r5(lv.run * 0.6 * f));
    var consNote = cons ? "Semaine de consolidation : volume réduit, pas de montée de palier. " : "";
    var out = [
      sess(d(1), "palier", lv.title, lv.blocks, { level: lv.n, phase: PHASES[lv.phase], note: consNote + [lv.note, CADENCE].filter(Boolean).join(" "), key: true, consolidation: cons }),
      sess(d(3), "cadence", "Footing cadence", [W5, { k: "course", min: Math.max(10, cad - 9) , label: "Course facile" }, { rep: 6, steps: [{ k: "course", min: 0.5, label: "Cadence haute, même allure" }, { k: "course", min: 1, label: "Course facile" }] }, C5], { note: "Pas plus vite : seulement des pas plus courts et plus rapides." }),
      sess(d(4), "velo", "Vélo ou elliptique", bike(clamp(45 + 5 * (lv.n - 8), 40, 90) * f), { note: "Endurance sans impact pour le tibia." }),
      sess(d(5), "rando", "Rando-course", rando(clamp(50 + 5 * lv.n, 60, 150) * f, Math.min(25, Math.round(lv.run * 0.3))), { note: "Terrain souple. Montées raides et descentes en marchant." }),
    ];
    return out;
  }

  // ---------- Fiche course et estimations ----------
  var PREP = [ // semaines recommandées selon le km-effort total
    { max: 45, min: 12, max_: 16, label: "trail court à moyen" },
    { max: 75, min: 20, max_: 24, label: "≈ 50 km trail" },
    { max: 115, min: 28, max_: 36, label: "80 à 100 km" },
    { max: 210, min: 36, max_: 44, label: "100 à 160 km" },
    { max: 1e9, min: 40, max_: 52, label: "160 km et plus" },
  ];
  function analyseRace(race, ref, startDate) {
    var stages = Math.max(1, race.stages || 1);
    var kmE = race.km + race.dplus / 100;
    var ratio = race.km ? race.dplus / race.km : 0;
    var profil = ratio < 20 ? "roulant" : ratio <= 40 ? "vallonné" : "montagne";
    var refKmE = ref.km + ref.dplus / 100, refSpeed = refKmE / ref.hours;
    var stageKmE = kmE / stages;
    var t = (stageKmE / refSpeed) * Math.pow(stageKmE / refKmE, 0.15);
    if (race.terrain === "technique") t *= 1.1;
    if (t > 6) t *= 1.1; // arrêts aux ravitaillements, sac, nuit
    if (race.night) t *= 1.05;
    var total = t * stages;
    var prep = PREP.filter(function (p) { return kmE < p.max; })[0];
    var weeks = startDate ? Math.floor(diffDays(mondayOf(startDate), race.date) / 7) : null;
    var feas = weeks == null ? null : weeks >= prep.min ? "ok" : weeks >= Math.round(prep.min * 0.75) ? "tendu" : "insuffisant";
    var margin = race.cutoffH ? race.cutoffH - total : null;
    return { kmE: Math.round(kmE), ratio: Math.round(ratio), profil: profil, stageHours: t, totalHours: total, prep: prep, weeks: weeks, feas: feas, margin: margin, stages: stages };
  }

  // ---------- Programme ultra ----------
  function buildProgram(profile, state, race) {
    var start = mondayOf(state.ultraStart || profile.switchDate);
    var an = analyseRace(race, profile.ref, start);
    var weeks = Math.max(1, Math.ceil((diffDays(start, mondayOf(race.date)) + 1) / 7));
    var catPeak = an.kmE < 75 ? 7 : an.kmE < 115 ? 9 : an.kmE < 210 ? 11 : 12;
    var peak = Math.min(profile.hoursMax || 10, catPeak);
    var taper = an.kmE < 115 ? 2 : 3;
    var spec = Math.min(5, Math.max(0, weeks - taper - 2));
    var constr = Math.min(8, Math.max(0, weeks - taper - spec - 1));
    var longPeak = an.stages > 1 ? clamp(an.stageHours * 0.5, 2.5, 5) : clamp(an.totalHours * 0.4, 2.5, 6);
    var dplusPeak = clamp(Math.round(race.dplus / an.stages * 1.0 / 100) * 100, 500, 5000);
    if (an.stages === 1) dplusPeak = clamp(Math.round(race.dplus * 0.75 / 100) * 100, 500, 5000);
    var h0 = profile.h0 || 4.5, h = h0, buildIdx = 0, out = [];
    var taperStart = weeks - taper;
    var chocs = {}; // index de semaine (0-based) -> true
    [taperStart - 2, taperStart - 5, taperStart - 9].forEach(function (i) { if (i >= 1 && i < taperStart) chocs[i] = true; });
    var prepRace = an.kmE >= 75 && taperStart - 7 >= 2 ? taperStart - 7 : null;
    for (var i = 0; i < weeks; i++) {
      var block = i >= taperStart ? "Affûtage" : i >= taperStart - spec ? "Spécifique" : i >= taperStart - spec - constr ? "Construction" : "Base";
      var hours, light = false;
      if (block === "Affûtage") { var k = i - taperStart; hours = peak * (taper === 3 ? [0.8, 0.6, 0.4] : [0.55, 0.4])[k]; }
      else {
        buildIdx++;
        if (buildIdx % 4 === 0 && !chocs[i]) { hours = h * 0.7; light = true; }
        else { h = Math.min(peak, i === 0 ? h0 : h * 1.1); hours = h; }
      }
      var monday = addDays(start, i * 7);
      if (state.reduce[monday]) { hours *= 0.7; light = true; }
      var frac = hours / peak;
      var w = { i: i + 1, monday: monday, block: block, hours: Math.round(hours * 2) / 2, light: light, choc: !!chocs[i], prepRace: prepRace === i,
        dplus: block === "Affûtage" ? Math.round(dplusPeak * frac * 0.6 / 50) * 50 : Math.round(dplusPeak * frac / 50) * 50 };
      w.sessions = ultraWeek(w, race, an, longPeak, weeks - i, hours);
      out.push(w);
    }
    return { weeks: out, analysis: an, peak: peak, longPeak: longPeak, dplusPeak: dplusPeak, taper: taper, gates: gates(out, an, longPeak) };
  }

  function ultraWeek(w, race, an, longPeak, left, hours) {
    var M = hours * 60, d = function (n) { return addDays(w.monday, n); }, s = [];
    var longMin = Math.min(longPeak * 60, M * 0.35);
    if (w.block === "Affûtage") {
      if (left === 1) s.push(sess(d(1), "footing", "Footing + 4 accélérations", strides(30)));
      else {
        s.push(sess(d(1), "footing", "Footing + 6 accélérations", strides(M * 0.25)));
        s.push(sess(d(3), "rando", "Rando-course courte", rando(M * 0.25, 20)));
        s.push(sess(d(5), "longue", "Sortie moyenne", easy(M * 0.4, "Course facile, terrain de la course")));
      }
      return s.filter(function (x) { return x.date < race.date; });
    }
    s.push(sess(d(1), "footing", w.block === "Base" ? "Footing + 6 accélérations" : "Footing", w.block === "Base" ? strides(M * 0.14) : easy(M * 0.12), { note: CADENCE }));
    if (w.block === "Base") s.push(sess(d(3), "rando", "Rando-course avec D+", rando(M * 0.2, 20)));
    else s.push(sess(d(3), "cote", "Montées marchées sur la côte (" + Math.min(10, 4 + Math.floor(hours / 2)) + " ×)", hikeRepeats(M * 0.16, Math.min(10, 4 + Math.floor(hours / 2))), { note: "Marche rapide en montée, bâtons si tu cours avec. Faible impact pour le tibia." }));
    s.push(sess(d(4), "velo", "Vélo ou elliptique", bike(clamp(M * 0.12, 40, 120))));
    if (w.choc && an.stages > 1) {
      var dd = r5(Math.min(longPeak * 60, an.stageHours * 60 * 0.5));
      s = s.filter(function (x) { return x.date !== d(4); });
      s.push(sess(d(4), "longue", "Bloc 3 jours — jour 1", easy(dd, "Course et marche, sac de course"), { note: "Simulation des étapes : sac, ravitaillement, matériel." }));
      s.push(sess(d(5), "longue", "Bloc 3 jours — jour 2", easy(dd * 0.85, "Course et marche, sac de course")));
      s.push(sess(d(6), "longue", "Bloc 3 jours — jour 3", easy(dd * 0.7, "Course et marche, sac de course")));
    } else if (w.choc) {
      s = s.filter(function (x) { return x.kind !== "velo"; });
      s.push(sess(d(5), "longue", "Week-end choc — jour 1", easy(longPeak * 60, "Course et marche, sac complet"), { note: "Teste nutrition et matériel." }));
      s.push(sess(d(6), "longue", "Week-end choc — jour 2", easy(longPeak * 60 * 0.6, "Course et marche sur jambes fatiguées")));
    } else {
      s.push(sess(d(5), "longue", w.block === "Base" ? "Sortie longue" : "Sortie longue avec sac", easy(longMin, "Course facile, montées raides marchées"), { note: w.prepRace ? "Semaine idéale pour une course de préparation : ≈ " + Math.round(race.km / 2) + " km et " + Math.round(race.dplus / 2) + " m D+." : "" }));
      s.push(sess(d(6), "footing", "Sortie enchaînée", easy(M * 0.18, "Course facile sur jambes fatiguées")));
    }
    return s.filter(function (x) { return x.date < race.date; });
  }

  function gates(weeks, an, longPeak) {
    var g = [];
    var lastBase = weeks.filter(function (w) { return w.block === "Base"; }).pop();
    if (lastBase) g.push({ key: "base-" + lastBase.monday, date: addDays(lastBase.monday, 6), c: "Fin de la Base : " + String(lastBase.hours).replace(".", ",") + " h/semaine sans séance orange ni rouge" });
    weeks.filter(function (w) { return w.choc; }).forEach(function (w) { g.push({ key: "choc-" + w.monday, date: addDays(w.monday, 6), c: (an.stages > 1 ? "Bloc 3 jours" : "Week-end choc") + " du " + longDate(addDays(w.monday, an.stages > 1 ? 4 : 5)) + " sans douleur le lendemain" }); });
    var t = weeks.filter(function (w) { return w.block === "Affûtage"; })[0];
    if (t) g.push({ key: "go-" + t.monday, date: t.monday, c: "Avant l'affûtage : sortie de " + longPeak.toFixed(1).replace(".", ",") + " h faite, tibia calme" });
    return g.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }

  // ---------- Séances d'une date ----------
  function sessionsOn(profile, state, date, race) {
    if (state.stopped) return [];
    if (state.mode === "reprise") {
      var wk = repriseWeek(profile, state, mondayOf(date)).filter(function (x) { return x.date === date; });
      if (state.restUntil && date <= state.restUntil) wk = wk.filter(function (x) { return x.kind === "velo"; });
      return wk;
    }
    if (!race) return [];
    var p = buildProgram(profile, state, race), out = [];
    p.weeks.forEach(function (w) { w.sessions.forEach(function (x) { if (x.date === date) out.push(Object.assign({ week: w }, x)); }); });
    if (state.restUntil && date <= state.restUntil) out = out.filter(function (x) { return x.kind === "velo"; });
    return out;
  }
  function weekSessions(profile, state, monday, race) {
    var out = [];
    for (var i = 0; i < 7; i++) out = out.concat(sessionsOn(profile, state, addDays(monday, i), race));
    return out;
  }

  // ---------- Projection des semaines à venir ----------
  // Hypothèse : toutes les séances vertes. Rythme prudent : un palier toutes les 2 semaines ;
  // rythme dynamique : palier + footing cadence comptent → un palier par semaine.
  function projection(profile, state, today, race, nWeeks) {
    nWeeks = nWeeks || 26;
    var monday = mondayOf(today), out = [];
    var level = Math.min(state.level, MAX_LEVEL + 1), streak = state.streak;
    var switchDate = state.mode === "ultra" ? (state.ultraStart || profile.switchDate) : null, passWeeks = 0;
    var prog = null, perWeek = profile.rythme === "dynamique" ? 2 : 1, baseDate = state.mode === "ultra" || state.level >= RELIEF_LEVEL ? monday : null;
    for (var i = 0; i < nWeeks; i++) {
      var m = addDays(monday, i * 7), w = { monday: m, sessions: [] };
      if (!switchDate) {
        if (level <= MAX_LEVEL) {
          w.mode = "reprise"; w.level = level; w.consolidation = isConsolidation(profile, m);
          w.sessions = repriseWeek(profile, { level: level }, m);
          if (!baseDate && level >= RELIEF_LEVEL) baseDate = m;
          if ((i > 0 || weekday(today) <= 1) && !w.consolidation) { streak += perWeek; while (streak >= 2) { level++; streak -= 2; } }
        } else if (passWeeks < 3) {
          w.mode = "passage"; w.level = MAX_LEVEL; passWeeks++;
          w.sessions = repriseWeek(profile, { level: MAX_LEVEL }, m);
          if (passWeeks === 3) switchDate = addDays(m, 7);
        }
      }
      if (switchDate && m >= switchDate) {
        if (!race || m >= race.date) { w.mode = "attente"; }
        else {
          if (!prog) prog = buildProgram(Object.assign({}, profile, { switchDate: switchDate }), { ultraStart: switchDate, reduce: state.reduce || {} }, race);
          var pw = prog.weeks.filter(function (x) { return x.monday === m; })[0];
          if (pw) { w.mode = "programme"; w.block = pw.block; w.choc = pw.choc; w.light = pw.light; w.dplus = pw.dplus; w.sessions = pw.sessions; }
          else w.mode = "attente";
        }
      }
      w.minutes = w.sessions.reduce(function (t, x) { return t + totalMin(x.blocks); }, 0);
      w.runMinutes = w.sessions.filter(function (x) { return x.kind !== "velo"; }).reduce(function (t, x) { return t + totalMin(x.blocks); }, 0);
      out.push(w);
    }
    // baseDate : semaine où la reprise atteint le relief (palier 13, ≈ 5 h/semaine avec vélo et rando),
    // à partir de laquelle le rythme dynamique compte la préparation
    return { weeks: out, switchDate: switchDate, baseDate: baseDate };
  }

  // ---------- Export Intervals.icu ----------
  function dur(min) { var s = Math.round(min * 60); return s % 60 === 0 ? (s / 60) + "m" : s + "s"; }
  function stepLine(st) {
    var z = st.k === "marche" ? "Z1 HR" : st.k === "cote" ? "Z3 HR" : "Z2 HR";
    // libellés sans chiffres pour ne pas perturber l'analyse d'Intervals.icu
    var l = st.label || "", lbl;
    if (/^Échauffement/.test(l)) lbl = "Échauffement";
    else if (/^Retour/.test(l)) lbl = "Retour au calme";
    else if (/^Descente/.test(l)) lbl = "Descente marchée";
    else if (/^Cadence/.test(l)) lbl = "Cadence haute";
    else if (/^Rando/.test(l)) lbl = "Rando";
    else lbl = st.k === "marche" ? "Marche" : st.k === "cote" ? "Montée" : st.k === "velo" ? "Vélo" : "Course";
    return "- " + lbl + " " + dur(st.min) + " " + z;
  }
  function intervalsText(blocks) {
    var lines = [];
    blocks.forEach(function (b) {
      if (b.rep) { lines.push(""); lines.push(b.rep + "x"); b.steps.forEach(function (st) { lines.push(stepLine(st)); }); lines.push(""); }
      else lines.push(stepLine(b));
    });
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  function intervalsEvent(session) {
    return { category: "WORKOUT", type: session.sport || "Run", start_date_local: session.date + "T00:00:00", name: session.title, description: intervalsText(session.blocks), moving_time: Math.round(totalMin(session.blocks) * 60) };
  }

  function prepStart(profile, state, today) {
    if (state.mode === "ultra") return state.ultraStart || today;
    var pr = projection(profile, state, today, null, 80);
    return (profile.rythme === "dynamique" ? pr.baseDate : pr.switchDate) || addDays(today, 560);
  }

  // ---------- Estimation de la charge cible (fin de reprise) ----------
  function estimateOptimal(profile, state, today) {
    if (state.mode === "ultra") return null;
    // même hypothèse que la projection : une séance palier verte par semaine, puis 3 semaines de test
    return projection(profile, state, today, null, 80).switchDate || addDays(today, 560);
  }

  var api = { LEVELS: LEVELS, MAX_LEVEL: MAX_LEVEL, LADDER_V1: LADDER_V1, isConsolidation: isConsolidation, PHASES: PHASES, verdict: verdict, computeState: computeState, passage: passage,
    repriseWeek: repriseWeek, projection: projection, analyseRace: analyseRace, buildProgram: buildProgram, sessionsOn: sessionsOn, weekSessions: weekSessions,
    totalMin: totalMin, intervalsText: intervalsText, intervalsEvent: intervalsEvent, estimateOptimal: estimateOptimal, prepStart: prepStart,
    addDays: addDays, diffDays: diffDays, todayStr: todayStr, longDate: longDate, monthYear: monthYear, mondayOf: mondayOf, weekday: weekday };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Engine = api;
})(this);
