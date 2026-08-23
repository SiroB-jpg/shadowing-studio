#!/usr/bin/env node
/**
 * Validates conjugator.mjs against the 46 hand-written verb tables in the
 * `Verb.V = {...}` object of shadowing-studio/app.js.  app.js is READ ONLY.
 *
 * Usage:  node test-conjugator.mjs [path/to/app.js]
 * Exit 0 = every difference from the hand-written tables is an explicitly
 *          declared correction; 1 = at least one undeclared difference.
 *
 * A difference is only tolerated if it appears in KNOWN_CORRECTIONS **and**
 * matches it exactly in field, old value AND new value. Any other difference
 * -- including a different wrong value in the same field of the same verb --
 * still fails loudly. A declared correction that no longer occurs also fails,
 * so the allow-list cannot rot into a blanket exemption.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { conjugate, assertAgreeable, agree, compoundForms } from "./conjugator.mjs";

/* ------------------------------------------------------------------ *
 * Deliberate corrections to the hand-written tables.                  *
 * Every entry must state field, exact `was`, exact `now`, and why.    *
 * ------------------------------------------------------------------ */
const KNOWN_CORRECTIONS = [
  {
    verb: "finire", field: "aux", was: "avere", now: ["avere", "essere"],
    reason: "finire takes both auxiliaries: transitive 'ho finito il lavoro', " +
            "intransitive 'il film e' finito'. The table stored only avere. " +
            "Requested 2026-08-21: show both. avere stays first (more common)."
  },
  {
    verb: "vivere", field: "aux", was: "avere", now: ["avere", "essere"],
    reason: "vivere takes both auxiliaries: 'ho vissuto a Roma' / 'e' vissuto " +
            "nel Novecento'. The table stored only avere. " +
            "Requested 2026-08-21: show both. avere stays first (more common)."
  }
];

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = process.argv[2] || resolve(HERE, "../shadowing-studio/app.js");

/* ---- extract the ground truth ---- */
const ROW = /^\s*([a-zà-ù]+):\{en:"([^"]*)",presente:\[([^\]]*)\],imperfetto:\[([^\]]*)\],aux:"([^"]*)",part:"([^"]*)"\}/;
const truth = {};
for (const line of readFileSync(APP, "utf8").split("\n")) {
  const m = ROW.exec(line);
  if (!m) continue;
  const list = s => s.split(",").map(x => x.trim().replace(/^"|"$/g, ""));
  truth[m[1]] = { en: m[2], presente: list(m[3]), imperfetto: list(m[4]), aux: m[5], part: m[6] };
}
const verbs = Object.keys(truth);
console.log(`Ground truth: ${verbs.length} hand-written tables read from ${APP}\n`);
if (verbs.length !== 46) console.log(`!! expected 46 tables, found ${verbs.length}\n`);

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const PERSON = ["io", "tu", "lui/lei", "noi", "voi", "loro"];

const correctionSeen = new Set();
function declaredCorrection(verb, field, was, now) {
  const hit = KNOWN_CORRECTIONS.find(c =>
    c.verb === verb && c.field === field && eq(c.was, was) && eq(c.now, now));
  if (hit) correctionSeen.add(verb + "." + field);
  return hit;
}

let exact = 0, corrected = 0, regressed = 0;
let cellsOk = 0, cellsCorrected = 0, cellsBad = 0;
const regressions = [], corrections = [];

for (const v of verbs) {
  const want = truth[v], got = conjugate(v);
  const bad = [], fixed = [];
  if (!got) {
    bad.push(`conjugate("${v}") returned null`);
    cellsBad += 14;
  } else {
    for (let i = 0; i < 6; i++) {
      for (const t of ["presente", "imperfetto"]) {
        if (got[t][i] === want[t][i]) cellsOk++;
        else { cellsBad++; bad.push(`${t} ${PERSON[i]}: got "${got[t][i]}" want "${want[t][i]}"`); }
      }
    }
    for (const field of ["aux", "part"]) {
      if (eq(got[field], want[field])) { cellsOk++; continue; }
      const c = declaredCorrection(v, field, want[field], got[field]);
      if (c) { cellsCorrected++; fixed.push(`${field}: ${JSON.stringify(want[field])} -> ${JSON.stringify(got[field])}`); }
      else { cellsBad++; bad.push(`${field}: got ${JSON.stringify(got[field])} want ${JSON.stringify(want[field])}`); }
    }
  }
  if (bad.length) { regressed++; regressions.push({ v, bad }); }
  else if (fixed.length) { corrected++; corrections.push({ v, fixed }); }
  else exact++;
}

/* ---- stale allow-list entries are a failure too ---- */
const stale = KNOWN_CORRECTIONS.filter(c => !correctionSeen.has(c.verb + "." + c.field));

/* ---- participle agreement is regular for every ground-truth participle ---- */
const badAgreement = [];
for (const v of verbs) {
  const g = conjugate(v);
  if (!g) continue;
  if (!assertAgreeable(g.part) || !eq(agree(g.part), g.partForms)) badAgreement.push(`${v}: ${g.part}`);
  for (const t of ["passato", "trapassato"]) {
    const c = compoundForms(v, t);
    if (!c || c.length !== 6 || c.some(r => !r.length || r.some(x => !x))) badAgreement.push(`${v}: ${t} build failed`);
  }
}

if (corrections.length) {
  console.log("DELIBERATE CORRECTIONS (declared in KNOWN_CORRECTIONS)");
  console.log("-----------------------------------------------------");
  for (const c of corrections) {
    console.log(`  ${c.v}: ${c.fixed.join("; ")}`);
    const why = KNOWN_CORRECTIONS.find(k => k.verb === c.v);
    console.log(`      reason: ${why.reason}`);
  }
  console.log("");
}
if (regressions.length) {
  console.log("REGRESSIONS (undeclared -- these are failures)");
  console.log("---------------------------------------------");
  for (const f of regressions) { console.log(`  ${f.v}`); for (const d of f.bad) console.log(`      ${d}`); }
  console.log("");
}
if (stale.length) {
  console.log("STALE ALLOW-LIST ENTRIES (declared but no longer occurring -- failure)");
  for (const c of stale) console.log(`  ${c.verb}.${c.field}`);
  console.log("");
}
if (badAgreement.length) {
  console.log("PARTICIPLE AGREEMENT PROBLEMS (failure)");
  for (const b of badAgreement) console.log(`  ${b}`);
  console.log("");
}

const total = verbs.length * 14;
const ok = regressed === 0 && stale.length === 0 && badAgreement.length === 0;
console.log("SUMMARY");
console.log("-------");
console.log(`  verbs   : ${exact} reproduced exactly, ${corrected} deliberately corrected, ${regressed} regressed  (of ${verbs.length})`);
console.log(`  cells   : ${cellsOk} identical + ${cellsCorrected} declared corrections + ${cellsBad} unexplained = ${total}`);
console.log(`  agree   : ${verbs.length - badAgreement.length}/${verbs.length} participles inflect regularly -o/-a/-i/-e, compound tenses build`);
console.log(`  result  : ${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
