/* Moteur de l'appli Reprise & Raid — logique pure, sans interface.
   Toutes les dates sont des chaînes locales "AAAA-MM-JJ". */
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

  // ---------- Paliers de reprise ----------
  // Chaque bloc : {k:"marche"|"course"|"cote", min, label?} ou {rep:n, steps:[...]}
  var W5 = { k: "marche", min: 5, label: "Échauffement" }, C5 = { k: "marche", min: 5, label: "Retour au calme" };
  function cont(min) { return [W5, { k: "course", min: min, label: "Course facile" }, C5]; }
  var LEVELS = [
    { n: 1, phase: 0, title: "6 × (3 min course / 1 min marche)", run: 18, blocks: [W5, { rep: 6, steps: [{ k: "course", min: 3 }, { k: "marche", min: 1 }] }, C5] },
    { n: 2, phase: 0, title: "5 × (5 min course / 1 min marche)", run: 25, blocks: [W5, { rep: 5, steps: [{ k: "course", min: 5 }, { k: "marche", min: 1 }] }, C5] },
    { n: 3, phase: 0, title: "4 × (8 min course / 1 min marche)", run: 32, blocks: [W5, { rep: 4, steps: [{ k: "course", min: 8 }, { k: "marche", min: 1 }] }, C5] },
    { n: 4, phase: 1, title: "30 min continu", run: 30, blocks: cont(30) },
    { n: 5, phase: 1, title: "35 min continu", run: 35, blocks: cont(35) },
    { n: 6, phase: 1, title: "40 min continu", run: 40, blocks: cont(40) },
    { n: 7, phase: 1, title: "45 min continu", run: 45, blocks: cont(45) },
    { n: 8, phase: 2, title: "50 min continu", run: 50, blocks: cont(50) },
    { n: 9, phase: 2, title: "55 min continu", run: 55, blocks: cont(55) },
    { n: 10, phase: 2, title: "60 min continu", run: 60, blocks: cont(60) },
    { n: 11, phase: 3, title: "50 min avec 6 montées courues", run: 50, blocks: [W5, { k: "course", min: 15, label: "Course facile" }, { rep: 6, steps: [{ k: "cote", min: 1, label: "Montée courue, facile" }, { k: "marche", min: 2, label: "Descente marchée" }] }, { k: "course", min: 17, label: "Course facile" }, C5] },
    { n: 12, phase: 3, title: "60 min avec 8 montées courues", run: 60, blocks: [W5, { k: "course", min: 15, label: "Course facile" }, { rep: 8, steps: [{ k: "cote", min: 1.5, label: "Montée courue, facile" }, { k: "marche", min: 2, label: "Descente marchée" }] }, { k: "course", min: 17, label: "Course facile" }, C5] },
    { n: 13, phase: 4, title: "Trail 70 min", run: 70, blocks: [W5, { k: "course", min: 70, label: "Trail facile, descentes prudentes" }, C5] },
    { n: 14, phase: 4, title: "Trail 80 min", run: 80, blocks: [W5, { k: "course", min: 80, label: "Trail facile, descentes courues" }, C5] },
    { n: 15, phase: 4, title: "Trail 90 min", run: 90, blocks: [W5, { k: "course", min: 90, label: "Trail facile, descentes courues" }, C5] },
  ];
  var MAX_LEVEL = LEVELS.length; // 15 ; level 16 = reprise terminée
  var PHASES = ["Repli course/marche", "Continu sur le plat", "Volume", "Relief doux", "Trail"];

  // ---------- Verdict d'une séance ----------
  // log : {date, during, after, morning|null, increasing, flags:[bool,bool,bool]}
  function verdict(log) {
    if (log.flags && log.flags.some(Boolean)) return "stop";
    var m = log.morning;
    if (log.during >= 6 || log.after >= 6 || log.increasing || (m != null && m >= 4)) return "rouge";
    if (log.during >= 4 || log.after >= 4 || (m != null && m >= 2 && m > (log.baseline || 0))) return "orange";
    return "vert";
  }

  // ---------- Rejouer l'historique ----------
  // profile : {startLevel, switchDate|null, raceDate, peakHours, gates:{}, hop, kine}
  function computeState(profile, logs, today) {
    var s = { mode: "reprise", level: profile.startLevel || 6, streak: 0, stopped: false, lastDate: null, lastVerdict: null, restDays: 0, ultraStart: null, ultraReduce: {}, events: [] };
    var sorted = (logs || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    sorted.forEach(function (log) {
      var v = verdict(log);
      log._v = v; log._provisional = log.morning == null;
      s.lastDate = log.date; s.lastVerdict = v;
      if (profile.switchDate && s.mode === "reprise" && log.date >= profile.switchDate && !s._returned) { s.mode = "ultra"; s.ultraStart = profile.switchDate; }
      if (v === "stop") { s.stopped = !(profile.clearedStop && profile.clearedStop >= log.date); s.level = Math.max(1, Math.min(s.level, MAX_LEVEL) - 2); s.streak = 0; s.restDays = 3; if (s.mode === "ultra") { s.mode = "reprise"; s._returned = true; s.level = 10; } s.events.push({ date: log.date, t: "Signe d'arrêt" }); return; }
      if (s.mode === "ultra") {
        if (v === "rouge") { s.mode = "reprise"; s._returned = true; s.level = 10; s.streak = 0; s.restDays = 3; s.events.push({ date: log.date, t: "Rouge : retour en reprise (60 min continu)" }); }
        else if (v === "orange") { s.ultraReduce[addDays(mondayOf(log.date), 7)] = true; s.restDays = 2; }
        else { s.restDays = 2; }
        return;
      }
      if (v === "vert") { s.streak++; if (s.streak >= 2 && s.level <= MAX_LEVEL) { s.level++; s.streak = 0; s.events.push({ date: log.date, t: "Palier suivant" }); } s.restDays = 2; }
      else if (v === "orange") { s.streak = 0; s.restDays = 2; }
      else { s.level = Math.max(1, Math.min(s.level, MAX_LEVEL) - 2); s.streak = 0; s.restDays = 3; s.events.push({ date: log.date, t: "Rouge : recul de 2 paliers" }); }
    });
    if (profile.switchDate && s.mode === "reprise" && !s._returned && today >= profile.switchDate) { s.mode = "ultra"; s.ultraStart = profile.switchDate; }
    s.nextDate = s.lastDate ? addDays(s.lastDate, s.restDays) : today;
    if (s.nextDate < today) s.nextDate = today;
    // pas plus de 3 courses sur 7 jours glissants
    var last7 = sorted.filter(function (l) { return diffDays(l.date, s.nextDate) < 7 && diffDays(l.date, s.nextDate) > 0; });
    if (last7.length >= 3) { var third = last7[last7.length - 3].date; s.nextDate = addDays(third, 7); }
    s.logs = sorted;
    s.done = s.level > MAX_LEVEL;
    return s;
  }

  // ---------- Test de passage ----------
  function passage(profile, state, today) {
    var recent = state.logs.filter(function (l) { return diffDays(l.date, today) <= 21; });
    var allGreen = recent.length >= 6 && recent.every(function (l) { return l._v === "vert" && !l._provisional; });
    var items = [
      { k: "paliers", label: "Paliers validés jusqu'au trail de 90 min", ok: state.done, required: true },
      { k: "vert", label: "3 semaines au vert (6 séances ou plus)", ok: allGreen, required: true, detail: recent.length + " séance(s) sur 21 jours" },
      { k: "hop", label: "20 à 30 sauts sur une jambe sans douleur, de chaque côté", ok: !!profile.hop, required: true, manual: true },
      { k: "kine", label: "Feu vert du kiné ou du médecin", ok: !!profile.kine, required: false, manual: true },
    ];
    return { items: items, ready: items.every(function (i) { return !i.required || i.ok; }) };
  }

  // ---------- Plan ultra ----------
  function buildPlan(profile, state) {
    var start = mondayOf(state.ultraStart || profile.switchDate);
    var race = profile.raceDate;
    var weeks = Math.max(1, Math.ceil((diffDays(start, mondayOf(race)) + 1) / 7));
    var peak = profile.peakHours || 10, h0 = 4.5;
    var out = [], h = h0, buildIdx = 0;
    for (var i = 0; i < weeks; i++) {
      var left = weeks - i; // semaines restantes, course comprise
      var block = left <= 3 ? "Affûtage" : left <= 6 ? "Pic" : left <= 12 ? "Construction" : "Base";
      var hours, light = false;
      if (block === "Affûtage") hours = peak * [0.3, 0.45, 0.6][left - 1];
      else if (block === "Pic") hours = peak;
      else {
        buildIdx++;
        if (buildIdx % 4 === 0) { hours = h * 0.7; light = true; }
        else { h = Math.min(peak, i === 0 ? h0 : h * 1.1); hours = h; }
      }
      var monday = addDays(start, i * 7);
      if (state.ultraReduce[monday]) { hours *= 0.7; light = true; }
      out.push({ i: i + 1, monday: monday, block: block, hours: Math.round(hours * 2) / 2, light: light, sessions: weekSessions(block, hours, monday, race, left) });
    }
    return out;
  }

  function sess(date, title, min, blocks, note) { return { date: date, title: title, min: Math.round(min / 5) * 5, blocks: blocks, note: note || "" }; }
  function easy(min, label) { return [W5, { k: "course", min: Math.max(10, Math.round((min - 10) / 5) * 5), label: label || "Course facile" }, C5]; }
  function hills(min, reps) {
    var main = reps * 5;
    return [{ k: "course", min: 15, label: "Échauffement en course facile" }, { rep: reps, steps: [{ k: "cote", min: 2, label: "Montée de la côte (80 m D+), effort soutenu" }, { k: "marche", min: 3, label: "Descente marchée" }] }, { k: "course", min: Math.max(10, Math.round(min - 15 - main)), label: "Retour au calme" }];
  }
  function weekSessions(block, hours, monday, race, left) {
    var M = hours * 60, d = function (n) { return addDays(monday, n); }, s = [];
    if (block === "Base") {
      s.push(sess(d(1), "Footing", M * 0.18, easy(M * 0.18)));
      s.push(sess(d(3), "Footing + 6 accélérations", M * 0.2, easy(M * 0.2, "Course facile, 6 × 20 s plus vite à la fin")));
      s.push(sess(d(5), "Sortie longue", M * 0.37, easy(M * 0.37, "Sortie longue facile, terrain varié")));
      s.push(sess(d(6), "Footing souple", M * 0.25, easy(M * 0.25)));
    } else if (block === "Construction") {
      var reps = Math.min(10, 5 + Math.floor(hours / 3));
      s.push(sess(d(1), "Côtes répétées (" + reps + " ×)", M * 0.17, hills(M * 0.17, reps), "Sur ta côte de 80 m D+."));
      s.push(sess(d(3), "Footing vallonné", M * 0.18, easy(M * 0.18, "Course facile, vallonné")));
      s.push(sess(d(5), "Sortie longue avec sac", M * 0.35, easy(M * 0.35, "Sortie longue facile avec sac chargé"), "Teste ravitaillement et matériel."));
      s.push(sess(d(6), "Sortie enchaînée", M * 0.3, easy(M * 0.3, "Course facile sur jambes fatiguées")));
    } else if (block === "Pic") {
      s.push(sess(d(1), "Côtes répétées (6 ×)", M * 0.12, hills(M * 0.12, 6)));
      if (left === 5) {
        s.push(sess(d(4), "Bloc 3 jours — jour 1 (≈ 35 km)", 240, easy(240, "Course/marche active, allure Raid"), "Point de décision fin mai."));
        s.push(sess(d(5), "Bloc 3 jours — jour 2 (≈ 30 km)", 210, easy(210, "Course/marche active, allure Raid")));
        s.push(sess(d(6), "Bloc 3 jours — jour 3 (≈ 25 km)", 180, easy(180, "Course/marche active, allure Raid")));
      } else {
        s.push(sess(d(3), "Footing", M * 0.13, easy(M * 0.13)));
        s.push(sess(d(5), "Sortie longue (nuit possible)", M * 0.4, easy(M * 0.4, "Sortie longue facile, sac complet"), "Une de ces sorties de nuit, frontale."));
        s.push(sess(d(6), "Sortie enchaînée", M * 0.35, easy(M * 0.35, "Course facile sur jambes fatiguées")));
      }
    } else {
      if (left === 1) {
        s.push(sess(d(1), "Footing + 4 accélérations", 30, easy(30, "Course facile, 4 × 20 s plus vite")));
      } else {
        s.push(sess(d(1), "Footing + 6 accélérations", M * 0.25, easy(M * 0.25, "Course facile, 6 × 20 s plus vite")));
        s.push(sess(d(3), "Footing", M * 0.25, easy(M * 0.25)));
        s.push(sess(d(5), "Sortie moyenne", M * 0.4, easy(M * 0.4, "Course facile, terrain du Raid")));
      }
    }
    return s.filter(function (x) { return x.date < race; });
  }

  // ---------- Séance du jour ----------
  function nextSession(profile, state, today) {
    if (state.mode === "reprise") {
      var lv = LEVELS[Math.min(state.level, MAX_LEVEL) - 1];
      return { date: state.nextDate, title: lv.title, min: totalMin(lv.blocks), blocks: lv.blocks, level: lv.n, phase: PHASES[lv.phase] };
    }
    var plan = buildPlan(profile, state);
    for (var i = 0; i < plan.length; i++) for (var j = 0; j < plan[i].sessions.length; j++) {
      var x = plan[i].sessions[j];
      if (x.date >= state.nextDate) return Object.assign({ week: plan[i] }, x);
    }
    return null;
  }

  function totalMin(blocks) {
    return blocks.reduce(function (t, b) { return t + (b.rep ? b.rep * b.steps.reduce(function (u, st) { return u + st.min; }, 0) : b.min); }, 0);
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
    else lbl = st.k === "marche" ? "Marche" : st.k === "cote" ? "Montée" : "Course";
    return "- " + lbl + " " + dur(st.min) + " " + z;
  }
  function intervalsText(blocks, note) {
    var lines = [];
    blocks.forEach(function (b) {
      if (b.rep) { lines.push(""); lines.push(b.rep + "x"); b.steps.forEach(function (st) { lines.push(stepLine(st)); }); lines.push(""); }
      else lines.push(stepLine(b));
    });
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  function intervalsEvent(session, sport) {
    return {
      category: "WORKOUT",
      type: sport || "Run",
      start_date_local: session.date + "T00:00:00",
      name: session.title,
      description: intervalsText(session.blocks, session.note),
      moving_time: Math.round(totalMin(session.blocks) * 60),
    };
  }

  // ---------- Estimation de la charge optimale ----------
  function estimateOptimal(profile, state, today) {
    if (state.mode === "ultra") {
      var plan = buildPlan(profile, state), peak = profile.peakHours || 10;
      for (var i = 0; i < plan.length; i++) if (plan[i].hours >= 0.9 * peak) return plan[i].monday;
      return plan.length ? plan[plan.length - 1].monday : today;
    }
    var remaining = Math.max(0, (MAX_LEVEL + 1 - state.level) * 2 - state.streak);
    var weeks = remaining / 2.5 * 1.25 + 11; // paliers restants puis montée de 4,5 h à 9 h (+10 %/sem, semaines allégées)
    return addDays(today, Math.round(weeks * 7));
  }

  var api = { LEVELS: LEVELS, MAX_LEVEL: MAX_LEVEL, PHASES: PHASES, verdict: verdict, computeState: computeState, passage: passage, buildPlan: buildPlan,
    nextSession: nextSession, totalMin: totalMin, intervalsText: intervalsText, intervalsEvent: intervalsEvent, estimateOptimal: estimateOptimal,
    addDays: addDays, diffDays: diffDays, todayStr: todayStr, longDate: longDate, monthYear: monthYear, mondayOf: mondayOf };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Engine = api;
})(this);
