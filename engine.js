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
  // Structure reprise de ton protocole Nolio : 2 min de marche, puis blocs de course séparés par 1 min de marche
  var W2 = { k: "marche", min: 2, label: "Échauffement en marchant" }, C3 = { k: "marche", min: 3, label: "Retour au calme" };
  function frac(n, reps, block, walk) {
    return { n: n, phase: 0, title: reps + " × " + block + " min", run: reps * block, block: block, note: walk + " min de marche entre les blocs.",
      blocks: [W2, { rep: reps, steps: [{ k: "course", min: block, label: "Course facile" }, { k: "marche", min: walk, label: "Marche" }] }, C3] };
  }
  var LEVELS = [
    frac(1, 4, 5, 1), frac(2, 2, 11, 1), frac(3, 2, 12, 1), frac(4, 2, 13, 1), frac(5, 2, 14, 1),
    frac(6, 2, 15, 1), frac(7, 2, 16, 1), frac(8, 2, 17, 1), frac(9, 2, 18, 1),
    lvC(10, 1, 40), lvC(11, 1, 44), lvC(12, 1, 48),
    lvC(13, 2, 53), lvC(14, 2, 58),
    lvC(15, 3, 64, "Course facile, vallonné doux", RELIEF), lvC(16, 3, 70, "Course facile, vallonné doux", RELIEF),
    lvC(17, 4, 77, "Trail facile", "Montées raides marchées, descentes marchées."),
    lvC(18, 4, 85, "Trail facile", "Montées raides marchées, descentes douces courues."),
    lvC(19, 4, 90, "Trail facile", "Montées raides marchées, descentes courues sans freiner fort."),
  ];
  var RELIEF_LEVEL = 15, RETURN_LEVEL = 14; // 64 min vallonné ; retour à 58 min continu après un rouge en programme
  // Ancienne échelle (v1/v2, 15 paliers) → nouvelle
  var LADDER_V1 = [0, 1, 2, 3, 6, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
  var MAX_LEVEL = LEVELS.length;
  var PHASES = ["Course fractionnée", "Continu sur le plat", "Volume", "Relief doux", "Trail"];
  var CADENCE = "Cadence visée : 165 à 170 pas/min (alerte cadence sur la Fenix).";

  // ---------- Verdict d'une séance de course ----------
  // Seuils périostite : vert ≤ 3/10 pendant et après, rien le lendemain.
  // « jaune » = orange pendant seulement : 4–5/10 pendant la course, mais ≤ 3 après et 0–1 au réveil
  // (modèle de surveillance de la douleur : c'est la réponse à 24 h qui compte).
  function verdict(log) {
    if (log.flags && log.flags.some(Boolean)) return "stop";
    var m = log.morning;
    if (log.during >= 6 || log.after >= 6 || log.increasing || log.gait || (m != null && m >= 4)) return "rouge";
    if (log.after >= 4 || (m != null && m >= 2)) return "orange";
    if (log.during >= 4) return "jaune";
    return "vert";
  }
  // Deux « orange pendant » de suite comptent comme un orange
  function verdictInContext(log, prevVerdict) {
    var v = verdict(log);
    return v === "jaune" && prevVerdict === "jaune" ? "orange" : v;
  }

  // ---------- Semaines de consolidation ----------
  // Toutes les 4 semaines : pas de montée de palier, ≈ 25 % de volume en moins (cycle de remodelage osseux ≈ 3 semaines).
  function isConsolidation(profile, date) {
    if (!profile.cycleStart) return false;
    var k = Math.floor(diffDays(mondayOf(profile.cycleStart), mondayOf(date)) / 7);
    return k >= 0 && k % 4 === 3;
  }

  // ---------- Rejouer l'historique ----------
  // ---------- Qualité d'une séance faite (métriques montre + effort ressenti) ----------
  var EASY = { palier: 1, cadence: 1, footing: 1, vallon: 1, rando: 1, longue: 1 };
  function quality(log) {
    var r = [];
    if (EASY[log.kind] && log.rpe != null && log.rpe >= 6) r.push("effort ressenti " + log.rpe + "/10 sur une séance facile");
    if (EASY[log.kind] && log.hiShare != null && log.hiShare > 0.2) r.push(Math.round(log.hiShare * 100) + " % du temps au-dessus de la zone 2");
    if (log.plannedMin && log.actualMin && log.actualMin > log.plannedMin * 1.1) r.push("séance plus longue que prévu (" + log.actualMin + " min au lieu de " + log.plannedMin + ")");
    return r;
  }
  // Plus longue course des 30 derniers jours (sorties montre de type course + journal), en minutes de séance
  function longest30(logs, acts, today) {
    var m = 0;
    (acts || []).forEach(function (a) { if (a.run && a.date <= today && diffDays(a.date, today) <= 30) m = Math.max(m, a.min || 0); });
    (logs || []).forEach(function (l) { if (l.kind !== "rando" && l.date <= today && diffDays(l.date, today) <= 30) m = Math.max(m, l.actualMin || 0); });
    return m;
  }

  function computeState(profile, logs, today, ctx) {
    ctx = ctx || {};
    var s = { mode: "reprise", level: profile.startLevel || 6, streak: 0, stopped: false, lastDate: null, lastVerdict: null, restUntil: null, ultraStart: null, reduce: {}, events: [], returned: false };
    var sorted = (logs || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    var prevV = null;
    sorted.forEach(function (log) {
      var v = verdictInContext(log, prevV); prevV = verdict(log) === "jaune" ? v : verdict(log);
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
      if (v === "jaune") return; // pas de montée sur cette séance, série conservée
      // vert : seules les séances « palier » font monter
      // rythme « dynamique » : le footing cadence vert compte aussi → jusqu'à un palier par semaine
      log._q = quality(log);
      if (log._q.length) return; // séance trop intense ou trop longue : pas de montée, série conservée
      if (isConsolidation(profile, log.date)) return;
      var fast = profile.rythme === "dynamique" || profile.rythme === "limite";
      if (log.kind === "palier" || log.kind == null || (fast && log.kind === "cadence")) {
        s.streak++;
        if (s.streak >= (profile.rythme === "limite" ? 1 : 2) && s.level <= MAX_LEVEL) { s.level++; s.streak = 0; s.events.push({ date: log.date, t: "Palier suivant" }); }
      }
    });
    if (profile.switchDate && s.mode === "reprise" && !s.returned && today >= profile.switchDate) { s.mode = "ultra"; s.ultraStart = profile.switchDate; }
    s.logs = sorted;
    s.longest = longest30(sorted, ctx.acts, today);
    s.cap = s.longest ? Math.round(s.longest * 1.1) : null; // plafond de la prochaine course (+10 %)
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
    var walk = Math.max(15, r5((min - runMin) / 2));
    return [{ k: "marche", min: walk, label: "Rando, montées marchées vite" }, { k: "course", min: r5(runMin), label: "Course facile sur portion plate" }, { k: "marche", min: walk, label: "Rando, descentes marchées" }];
  }
  function hikeRepeats(min, reps) {
    var main = reps * 7;
    return [{ k: "course", min: 15, label: "Échauffement en course facile" }, { rep: reps, steps: [{ k: "cote", min: 4, label: "Montée de la côte en marche rapide" }, { k: "marche", min: 3, label: "Descente marchée" }] }, { k: "course", min: Math.max(10, r5(min - 15 - main)), label: "Retour au calme" }];
  }
  // « Footing de développement + lignes droites » (Nolio) : endurance puis 5 × (15 s vif / 45 s facile)
  function lignes(min) { return [W5, { k: "course", min: Math.max(10, r5(min - 15)), label: "Course facile" }, { rep: 5, steps: [{ k: "course", min: 0.25, label: "Ligne droite, relâché" }, { k: "course", min: 0.75, label: "Course facile" }] }, C5]; }
  // « Sortie longue avec rappel » (Nolio) : longue facile puis 10 min un cran au-dessus
  function rappel(min) { return [W5, { k: "course", min: Math.max(20, r5(min - 20)), label: "Course facile" }, { k: "cote", min: 10, label: "Rappel, un cran au-dessus" }, C5]; }
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
      sess(d(1), "palier", "Footing progression · " + lv.title, lv.blocks, { level: lv.n, phase: PHASES[lv.phase], note: consNote + [lv.note, CADENCE].filter(Boolean).join(" "), key: true, consolidation: cons }),
      lv.phase === 0
        ? sess(d(3), "cadence", "Footing cadence · 2 × " + Math.max(4, Math.round(lv.block * 0.6 * f)) + " min", [W5, { rep: 2, steps: [{ k: "course", min: Math.max(4, Math.round(lv.block * 0.6 * f)), label: "Course facile" }, { k: "marche", min: 1, label: "Marche" }] }, { rep: 4, steps: [{ k: "course", min: 0.5, label: "Cadence haute, même allure" }, { k: "course", min: 1, label: "Course facile" }] }, C5], { note: consNote + "Pas plus vite : seulement des pas plus courts et plus rapides." })
        : sess(d(3), "cadence", "Footing cadence · " + Math.max(10, cad - 9) + " min", [W5, { k: "course", min: Math.max(10, cad - 9) , label: "Course facile" }, { rep: 6, steps: [{ k: "course", min: 0.5, label: "Cadence haute, même allure" }, { k: "course", min: 1, label: "Course facile" }] }, C5], { note: consNote + "Pas plus vite : seulement des pas plus courts et plus rapides." }),
      sess(d(4), "velo", "Vélo / elliptique · facile", bike(clamp(45 + 5 * (lv.n - 10), 40, 90) * f), { note: "Endurance sans impact pour le tibia." }),
      sess(d(5), "rando", "Rando-course · terrain souple", rando(clamp(lv.run * 1.6, 45, 150) * f, Math.min(25, Math.round(lv.run * 0.3), lv.block || 99)), { note: "Terrain souple. Montées raides et descentes en marchant." }),
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
      var block = i >= taperStart ? "Affûtage" : i >= taperStart - spec ? "Spécifique" : i >= taperStart - spec - constr ? "Développement" : "Endurance fondamentale";
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
      w.infos = [];
      if (w.light) w.infos.push("Décharge / assimilation : la fatigue s'efface, la forme s'installe.");
      if (w.choc) w.infos.push(an.stages > 1 ? "Bloc 3 jours : simulation des étapes, sac et ravitaillement." : "Week-end choc : surcharge contrôlée, sommeil et nutrition soignés.");
      if (block === "Spécifique") w.infos.push("Spécifique : teste nutrition, matériel, départ de nuit à la frontale ; tannage des pieds.");
      if (block === "Affûtage") w.infos.push("Affûtage : volume en baisse, sommeil prioritaire.");
      out.push(w);
    }
    return { weeks: out, analysis: an, peak: peak, longPeak: longPeak, dplusPeak: dplusPeak, taper: taper, gates: gates(out, an, longPeak) };
  }

  function ultraWeek(w, race, an, longPeak, left, hours) {
    var M = hours * 60, d = function (n) { return addDays(w.monday, n); }, s = [];
    var longMin = Math.min(longPeak * 60, M * 0.35);
    if (w.block === "Affûtage") {
      if (left === 1) s.push(sess(d(1), "footing", "Footing facile · 4 accélérations", strides(30)));
      else {
        s.push(sess(d(1), "footing", "Footing facile · 6 accélérations", strides(M * 0.25)));
        s.push(sess(d(3), "rando", "Rando-course · courte", rando(M * 0.25, 20)));
        s.push(sess(d(5), "longue", "Sortie longue · réduite", easy(M * 0.4, "Course facile, terrain de la course")));
      }
      return s.filter(function (x) { return x.date < race.date; });
    }
    s.push(sess(d(1), "footing", w.block === "Endurance fondamentale" ? "Footing facile · lignes droites" : "Footing facile", w.block === "Endurance fondamentale" ? lignes(M * 0.14) : easy(M * 0.12), { note: CADENCE }));
    if (w.block === "Endurance fondamentale") s.push(sess(d(3), "vallon", "Vallon · facile", easy(M * 0.2, "Course facile, terrain vallonné"), { note: "Montées raides marchées." }));
    else s.push(sess(d(3), "cote", "Côtes marchées · " + Math.min(10, 4 + Math.floor(hours / 2)) + " montées", hikeRepeats(M * 0.16, Math.min(10, 4 + Math.floor(hours / 2))), { note: "Marche rapide en montée, bâtons si tu cours avec. Faible impact pour le tibia." }));
    s.push(sess(d(4), "velo", "Vélo / elliptique · facile", bike(clamp(M * 0.12, 40, 120))));
    if (w.choc && an.stages > 1) {
      var dd = r5(Math.min(longPeak * 60, an.stageHours * 60 * 0.5));
      s = s.filter(function (x) { return x.date !== d(4); });
      s.push(sess(d(4), "longue", "Bloc 3 jours · jour 1", easy(dd, "Course et marche, sac de course"), { note: "Simulation des étapes : sac, ravitaillement, matériel." }));
      s.push(sess(d(5), "longue", "Bloc 3 jours · jour 2", easy(dd * 0.85, "Course et marche, sac de course")));
      s.push(sess(d(6), "longue", "Bloc 3 jours · jour 3", easy(dd * 0.7, "Course et marche, sac de course")));
    } else if (w.choc) {
      s = s.filter(function (x) { return x.kind !== "velo"; });
      s.push(sess(d(5), "longue", "Week-end choc · jour 1", easy(longPeak * 60, "Course et marche, sac complet"), { note: "Teste nutrition et matériel." }));
      s.push(sess(d(6), "longue", "Week-end choc · jour 2", easy(longPeak * 60 * 0.6, "Course et marche sur jambes fatiguées")));
    } else {
      s.push(sess(d(5), "longue", w.block === "Endurance fondamentale" ? "Sortie longue · facile" : w.block === "Développement" && w.i % 2 === 0 ? "Sortie longue · avec rappel" : "Sortie longue · avec sac", w.block === "Développement" && w.i % 2 === 0 ? rappel(longMin) : easy(longMin, "Course facile, montées raides marchées"), { note: w.prepRace ? "Semaine idéale pour une course de préparation : ≈ " + Math.round(race.km / 2) + " km et " + Math.round(race.dplus / 2) + " m D+." : "" }));
      s.push(sess(d(6), "longue", "Sortie enchaînée · jambes fatiguées", easy(M * 0.18, "Course facile sur jambes fatiguées")));
    }
    return s.filter(function (x) { return x.date < race.date; });
  }

  function gates(weeks, an, longPeak) {
    var g = [];
    var lastBase = weeks.filter(function (w) { return w.block === "Endurance fondamentale"; }).pop();
    if (lastBase) g.push({ key: "base-" + lastBase.monday, date: addDays(lastBase.monday, 6), c: "Fin de l'endurance fondamentale : " + String(lastBase.hours).replace(".", ",") + " h/semaine sans séance orange ni rouge" });
    weeks.filter(function (w) { return w.choc; }).forEach(function (w) { g.push({ key: "choc-" + w.monday, date: addDays(w.monday, 6), c: (an.stages > 1 ? "Bloc 3 jours" : "Week-end choc") + " du " + longDate(addDays(w.monday, an.stages > 1 ? 4 : 5)) + " sans douleur le lendemain" }); });
    var t = weeks.filter(function (w) { return w.block === "Affûtage"; })[0];
    if (t) g.push({ key: "go-" + t.monday, date: t.monday, c: "Avant l'affûtage : sortie de " + longPeak.toFixed(1).replace(".", ",") + " h faite, tibia calme" });
    return g.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }

  // ---------- Forme du matin : VFC et pouls au repos (données Garmin via Intervals) ----------
  // Moyenne VFC sur 7 jours sous (moyenne 60 j − 0,5 écart-type), ou pouls au repos > moyenne 60 j + 5 → forme basse.
  function readiness(wellness, today) {
    var w = (wellness || []).filter(function (x) { return x.date <= today && diffDays(x.date, today) <= 60; });
    var hrv = w.filter(function (x) { return x.hrv > 0; }), out = { status: "inconnu", reasons: [] };
    function mean(a) { return a.reduce(function (t, v) { return t + v; }, 0) / a.length; }
    if (hrv.length >= 14) {
      var ln = hrv.map(function (x) { return Math.log(x.hrv); }), m = mean(ln);
      var sd = Math.sqrt(mean(ln.map(function (v) { return (v - m) * (v - m); })));
      var last7 = hrv.filter(function (x) { return diffDays(x.date, today) < 7; }).map(function (x) { return Math.log(x.hrv); });
      if (last7.length >= 3) { out.status = "ok"; if (mean(last7) < m - 0.5 * sd) { out.status = "bas"; out.reasons.push("variabilité cardiaque (VFC) sous ta normale sur 7 jours"); } }
    }
    var rhr = w.filter(function (x) { return x.rhr > 0; }), td = rhr.filter(function (x) { return x.date === today; })[0];
    if (rhr.length >= 14 && td) {
      var mr = mean(rhr.map(function (x) { return x.rhr; }));
      if (out.status === "inconnu") out.status = "ok";
      if (td.rhr > mr + 5) { out.status = "bas"; out.reasons.push("pouls au repos élevé ce matin (" + td.rhr + " contre " + Math.round(mr) + " d'habitude)"); }
    }
    return out;
  }

  // ---------- Ajustement d'une séance (plafond 30 jours, forme du jour) ----------
  function scaleRuns(blocks, factor) {
    return blocks.map(function (b) {
      if (b.rep) return Object.assign({}, b, { steps: scaleRuns(b.steps, factor) });
      return b.k === "course" || b.k === "cote" ? Object.assign({}, b, { min: Math.max(1, Math.round(b.min * factor)) }) : b;
    });
  }
  function adjust(x, state, ctx, date) {
    if (x.kind === "velo" || x.kind === "renfo") return x;
    var y = x, adj = [];
    if (ctx && ctx.readiness && ctx.readiness.status === "bas" && ctx.today === date) {
      if (x.kind === "palier" && x.level > 1) { var lv = LEVELS[x.level - 2]; y = Object.assign({}, x, { title: "Footing progression · " + lv.title + " (allégée)", blocks: lv.blocks, level: lv.n }); }
      else y = Object.assign({}, x, { title: x.title + " (allégée)", blocks: scaleRuns(x.blocks, 0.75) });
      adj.push("Forme basse ce matin : " + ctx.readiness.reasons.join(", ") + ". Séance allégée ; vélo facile possible à la place.");
    }
    if (state.cap && x.kind !== "rando") {
      var tot = totalMin(y.blocks);
      if (tot > state.cap) {
        var run = tot - (tot - y.blocks.reduce(function (t, b) { return t + (b.rep ? b.rep * b.steps.reduce(function (u, st) { return u + (st.k === "course" || st.k === "cote" ? st.min : 0); }, 0) : (b.k === "course" || b.k === "cote" ? b.min : 0)); }, 0));
        var f = Math.max(0.3, (run - (tot - state.cap)) / run);
        y = Object.assign({}, y, { title: y.title + " (plafonnée)", blocks: scaleRuns(y.blocks, f) });
        adj.push("Plafond de sécurité : ta plus longue sortie des 30 derniers jours fait " + state.longest + " min, donc pas plus de " + state.cap + " min aujourd'hui (+10 % au plus).");
      }
    }
    if (adj.length) y = Object.assign({}, y, { adjustments: adj });
    return y;
  }

  // ---------- Séances d'une date ----------
  // profile.moves : { "AAAA-MM-JJ|type": "AAAA-MM-JJ" (reportée) ou "skip" (annulée) }
  function sessionKey(x) { return (x.origDate || x.date) + "|" + x.kind; }
  function rawSessions(profile, state, from, to, race) {
    var out = [];
    if (state.mode === "reprise") {
      for (var m = mondayOf(from); m <= to; m = addDays(m, 7)) out = out.concat(repriseWeek(profile, state, m));
    } else if (race) {
      buildProgram(profile, state, race).weeks.forEach(function (w) { w.sessions.forEach(function (x) { out.push(Object.assign({ week: w }, x)); }); });
    }
    return out;
  }
  function sessionsOn(profile, state, date, race, ctx) {
    if (state.stopped) return [];
    if (state.mode === "ultra" && !race) return [];
    var moves = profile.moves || {};
    var out = rawSessions(profile, state, addDays(date, -14), addDays(date, 14), race).map(function (x) {
      var mv = moves[x.date + "|" + x.kind];
      if (mv === "skip") return null;
      return mv ? Object.assign({}, x, { origDate: x.date, date: mv }) : x;
    }).filter(function (x) { return x && x.date === date; });
    if (state.restUntil && date <= state.restUntil) out = out.filter(function (x) { return x.kind === "velo"; });
    return out.map(function (x) { return adjust(x, state, ctx, date); });
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
    var need = profile.rythme === "limite" ? 1 : 2;
    var prog = null, perWeek = profile.rythme === "dynamique" || profile.rythme === "limite" ? 2 : 1, baseDate = state.mode === "ultra" || state.level >= RELIEF_LEVEL ? monday : null;
    for (var i = 0; i < nWeeks; i++) {
      var m = addDays(monday, i * 7), w = { monday: m, sessions: [] };
      if (!switchDate) {
        if (level <= MAX_LEVEL) {
          w.mode = "reprise"; w.level = level; w.consolidation = isConsolidation(profile, m);
          w.sessions = repriseWeek(profile, { level: level }, m);
          if (!baseDate && level >= RELIEF_LEVEL) baseDate = m;
          if ((i > 0 || weekday(today) <= 1) && !w.consolidation) { streak += perWeek; while (streak >= need) { level++; streak -= need; } }
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
    return (profile.rythme === "dynamique" || profile.rythme === "limite" ? pr.baseDate : pr.switchDate) || addDays(today, 560);
  }

  // ---------- Estimation de la charge cible (fin de reprise) ----------
  function estimateOptimal(profile, state, today) {
    if (state.mode === "ultra") return null;
    // même hypothèse que la projection : une séance palier verte par semaine, puis 3 semaines de test
    return projection(profile, state, today, null, 80).switchDate || addDays(today, 560);
  }

  var api = { LEVELS: LEVELS, MAX_LEVEL: MAX_LEVEL, LADDER_V1: LADDER_V1, isConsolidation: isConsolidation, PHASES: PHASES, verdict: verdict, verdictInContext: verdictInContext, quality: quality, readiness: readiness, adjust: adjust, computeState: computeState, passage: passage,
    repriseWeek: repriseWeek, projection: projection, analyseRace: analyseRace, buildProgram: buildProgram, sessionsOn: sessionsOn, sessionKey: sessionKey, weekSessions: weekSessions,
    totalMin: totalMin, intervalsText: intervalsText, intervalsEvent: intervalsEvent, estimateOptimal: estimateOptimal, prepStart: prepStart,
    addDays: addDays, diffDays: diffDays, todayStr: todayStr, longDate: longDate, monthYear: monthYear, mondayOf: mondayOf, weekday: weekday };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Engine = api;
})(this);
