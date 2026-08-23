import { readFileSync, writeFileSync } from "node:fs";
import { conjugate } from "./conjugator.mjs";

/* Regenerates verbs.generated.json.  Run: node build-verbs.mjs
   Reads app.js READ-ONLY for the 46 existing tables and their English glosses. */
const APP = process.argv[2] || new URL("../shadowing-studio/app.js", import.meta.url).pathname;
const ROW = /^\s*([a-zà-ù]+):\{en:"([^"]*)",presente:\[([^\]]*)\],imperfetto:\[([^\]]*)\],aux:"([^"]*)",part:"([^"]*)"\}/;
const existing = {};
for (const line of readFileSync(APP, "utf8").split("\n")) {
  const m = ROW.exec(line); if (m) existing[m[1]] = m[2];
}

// glosses for the corpus verbs (the 46 above reuse the teacher's own wording)
const EN = {
  accentuare:"to accentuate, to emphasise", accettare:"to accept",
  accorgersi:"to notice, to realise", adattarsi:"to adapt (oneself)",
  aggiungere:"to add", aiutare:"to help", ascoltare:"to listen (to)",
  ascoltarsi:"to listen to oneself / to each other", aumentare:"to increase",
  avvisare:"to warn, to notify", cambiare:"to change", cantare:"to sing",
  chiarire:"to clarify", cominciare:"to begin", comportarsi:"to behave",
  comprare:"to buy", continuare:"to continue", controllare:"to check, to control",
  coprire:"to cover", decidere:"to decide", discutere:"to discuss",
  entrare:"to enter, to go in", evolversi:"to evolve", fermarsi:"to stop (oneself)",
  firmare:"to sign", funzionare:"to work, to function", giudicare:"to judge",
  imparare:"to learn", imporre:"to impose", influenzare:"to influence",
  interrompere:"to interrupt", intervenire:"to intervene, to step in",
  irrigidirsi:"to stiffen, to tense up", mandare:"to send", modificare:"to modify",
  offendere:"to offend", organizzarsi:"to get organised",
  partecipare:"to take part, to participate", prepararsi:"to get ready",
  provare:"to try", raccontare:"to tell, to recount", rallentare:"to slow down",
  reagire:"to react", regolare:"to regulate, to adjust", respirare:"to breathe",
  restare:"to stay, to remain", ricominciare:"to start again",
  rinunciare:"to give up, to renounce", ripartire:"to set off again, to leave again",
  ripetere:"to repeat", riposare:"to rest", risolvere:"to solve, to resolve",
  risparmiare:"to save (money, effort)", rispettare:"to respect",
  salutare:"to greet, to say hello", salvare:"to save, to rescue",
  scegliere:"to choose", seguire:"to follow", sentirsi:"to feel",
  sopportare:"to bear, to put up with", sperimentare:"to experiment, to try out",
  spiegare:"to explain", spingere:"to push", studiare:"to study",
  telefonare:"to phone", tornare:"to return, to go back"
};

const gap = JSON.parse(readFileSync(process.argv[3] || "/home/claude/verb-gap.json","utf8"));
const all = [...Object.keys(existing), ...gap.missing_infinitives].sort((a,b)=>a.localeCompare(b,"it"));

const out = {}, skipped = [], missingGloss = [];
for (const v of all) {
  if (out[v]) continue;
  const r = conjugate(v);
  if (!r) { skipped.push(v); continue; }
  const en = existing[v] || EN[v];
  if (!en) { missingGloss.push(v); continue; }
  out[v] = {
    en,
    presente: r.presente,
    imperfetto: r.imperfetto,
    aux: r.aux,
    part: r.part,
    partForms: r.partForms,
    reflexive: r.reflexive,
    irregular: r.irregular,
    confidence: r.confidence
  };
  if (r.review) out[v].review = r.review;
  if (r.notes.length) out[v].notes = r.notes;
}

const doc = {
  _meta: {
    generated: "2026-08-21",
    generator: "conjugator.mjs",
    source: "46 hand-written tables from shadowing-studio/app.js + 66 verbs from verb-gap.json",
    counts: { verbs: Object.keys(out).length,
              high: Object.values(out).filter(x=>x.confidence==="high").length,
              low:  Object.values(out).filter(x=>x.confidence==="low").length,
              reflexive: Object.values(out).filter(x=>x.reflexive).length,
              dualAux: Object.values(out).filter(x=>Array.isArray(x.aux)).length,
              needsHumanReview: Object.values(out).filter(x=>x.review||x.confidence==="low").length },
    fields: {
      presente:"congiuntivo presente, 6 persons (io tu lui/lei noi voi loro)",
      imperfetto:"congiuntivo imperfetto, 6 persons",
      aux:"\"avere\" | \"essere\" | [first, second] when the verb takes both; order = more common reading first",
      part:"past participle, masculine singular (the form used with avere)",
      partForms:"{ms,fs,mp,fp} agreement forms; used ONLY with essere -- with avere the participle is invariable",
      reflexive:"true = forms already carry the clitic (mi/ti/si/ci/vi/si); aux is always essere",
      irregular:"true = the entry needed a lexical table (irregular present stem, participle or imperfetto), not just the rules",
      confidence:"\"low\" = the FORMS are uncertain; a human Italian speaker should check them (reason in `notes`)",
      notes:"present only when confidence is \"low\"; says exactly what is uncertain",
      review:"present when the forms are certain but the entry itself is questionable (e.g. the string is more often another part of speech, or the verb is impersonal)"
    },
    compoundTenses:"NOT stored. Build at runtime: congiuntivo passato = aux presente + participle, trapassato = aux imperfetto + participle. With essere the participle takes partForms[ms|fs|mp|fp] (singular for persons 0-2, plural for 3-5); with avere it stays `part`. compoundForms() in conjugator.mjs does exactly this."
  },
  verbs: out
};
writeFileSync(new URL("verbs.generated.json", import.meta.url).pathname, JSON.stringify(doc, null, 1) + "\n");
console.log("verbs:", Object.keys(out).length, "| skipped:", skipped.join(", "), "| missing gloss:", missingGloss.join(", "));
console.log("dual aux:", Object.entries(out).filter(([,x])=>Array.isArray(x.aux)).map(([k])=>k).join(", "));
console.log("low:", Object.entries(out).filter(([,x])=>x.confidence==="low").map(([k])=>k).join(", ") || "(none)");
