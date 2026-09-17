/**
 * Italian subjunctive conjugator — congiuntivo presente & imperfetto,
 * plus auxiliary + past participle so a caller can build congiuntivo
 * passato (aux presente + participle) and trapassato (aux imperfetto + participle).
 *
 * Design notes (the linguistics this module encodes):
 *
 *  1. Congiuntivo presente is built on the 1sg PRESENT INDICATIVE stem:
 *       parlo -> parli...   faccio -> faccia...   vengo -> venga...   esco -> esca...
 *     and noi/voi are built on the 1pl PRESENT INDICATIVE stem:
 *       parliamo -> parliamo/parliate,  facciamo -> facciamo/facciate,
 *       dobbiamo -> dobbiamo/dobbiate,  sappiamo -> sappiamo/sappiate.
 *     So an irregular verb needs only TWO stored forms, not a full table.
 *
 *  2. Congiuntivo imperfetto = infinitive minus -re + ssi/ssi/sse/ssimo/ste/ssero,
 *     with a short closed list of exceptions (essere, dare, stare, fare, dire,
 *     bere, -durre, -porre, -trarre).
 *
 *  3. -isc- verbs are a lexical class: no rule exists, so we keep an explicit
 *     NON-isc list (a closed class) and treat other -ire verbs as -isc-.
 *
 *  4. Auxiliary has no rule: explicit essere list, default avere, and an
 *     explicit "both auxiliaries" list that forces confidence:"low".
 *
 * Output contract:
 *   conjugate(infinitive) -> {
 *     presente:[6], imperfetto:[6], aux:"essere"|"avere",
 *     part:"participle", irregular:boolean, confidence:"high"|"low"
 *   }  or null
 *
 * Reflexive verbs (-arsi/-ersi/-irsi) return forms WITH the clitic pronoun
 * (mi/ti/si/ci/vi/si), because a reflexive congiuntivo without its pronoun
 * would be a wrong form to show a learner. `part` is returned bare
 * (e.g. "fermato"); the caller must handle participle agreement.
 */

const PRON = ["mi", "ti", "si", "ci", "vi", "si"];

/* ------------------------------------------------------------------ *
 * 1. IRREGULAR PRESENT-INDICATIVE STEMS                               *
 *    value = [1sg present indicative, 1pl present indicative]         *
 *    A leading "*" means "this is the subjunctive singular stem        *
 *    directly" (used where the subjunctive is not derivable from the   *
 *    1sg indicative: essere/avere/dare/stare/sapere/dovere).           *
 * ------------------------------------------------------------------ */
const IRREG_PRES = {
  essere:   ["*si",    "siamo"],
  avere:    ["*abbi",  "abbiamo"],   // 1sg ind is "ho"; subj. stem is abbi-
  dare:     ["*di",    "diamo"],     // 1sg ind is "do"; subj. stem is di-
  stare:    ["*sti",   "stiamo"],    // 1sg ind is "sto"; subj. stem is sti-
  sapere:   ["*sappi", "sappiamo"],  // 1sg ind is "so"; subj. stem is sappi-
  dovere:   ["*debb",  "dobbiamo"],  // "debba" (standard) rather than "deva"
  andare:   ["vado",     "andiamo"],
  potere:   ["posso",    "possiamo"],
  volere:   ["voglio",   "vogliamo"],
  uscire:   ["esco",     "usciamo"],
  piacere:  ["piaccio",  "piacciamo"],
  dispiacere:["dispiaccio","dispiacciamo"],
  compiacere:["compiaccio","compiacciamo"],
  tacere:   ["taccio",   "tacciamo"],
  giacere:  ["giaccio",  "giacciamo"],
  morire:   ["muoio",    "moriamo"],
  parere:   ["paio",     "paiamo"],
  apparire: ["appaio",   "appariamo"],
  comparire:["compaio",  "compariamo"],
  scomparire:["scompaio","scompariamo"],
  bere:     ["bevo",     "beviamo"],
  spegnere: ["spengo",   "spegniamo"],
  cuocere:  ["cuocio",   "cuociamo"],
  udire:    ["odo",      "udiamo"],
  nascere:  ["nasco",    "nasciamo"],
  crescere: ["cresco",   "cresciamo"],
  riempire: ["riempio",  "riempiamo"],
  cucire:   ["cucio",    "cuciamo"],
  sciare:   ["scio",     "sciamo"]
};

/* Suffix rules that are safe: no Italian verb ends in these strings
 * without belonging to the family. Each gives [1sg, 1pl] from the prefix. */
const IRREG_SUFFIX = [
  ["tenere",  p => [p + "tengo",  p + "teniamo"]],   // mantenere, ottenere, sostenere...
  ["venire",  p => [p + "vengo",  p + "veniamo"]],   // intervenire, avvenire, provenire...
  ["manere",  p => [p + "mango",  p + "maniamo"]],   // rimanere, permanere
  ["salire",  p => [p + "salgo",  p + "saliamo"]],   // risalire, assalire
  ["valere",  p => [p + "valgo",  p + "valiamo"]],   // prevalere, equivalere
  ["uscire",  p => [p + "esco",   p + "usciamo"]],   // riuscire
  ["sedere",  p => [p + "siedo",  p + "sediamo"]],   // possedere
  ["gliere",  p => [p + "lgo",    p + "gliamo"]],    // scegliere, cogliere, togliere
  ["durre",   p => [p + "duco",   p + "duciamo"]],   // condurre, tradurre, produrre
  ["porre",   p => [p + "pongo",  p + "poniamo"]],   // imporre, comporre, proporre
  ["trarre",  p => [p + "traggo", p + "traiamo"]],   // attrarre, distrarre
  ["fare",    p => [p + "faccio", p + "facciamo"]],  // rifare, disfare, soddisfare
  ["piacere", p => [p + "piaccio",p + "piacciamo"]]
];

/* dire-compounds must be listed explicitly: many innocent -ire verbs end in
 * "dire" (spedire, gradire, udire, tradire, custodire, impedire...). */
const DIRE_FAMILY = new Set(["dire","ridire","disdire","indire","predire",
  "contraddire","benedire","maledire","interdire","addire"]);

/* Likewise dare/stare/andare compounds: mandare, restare, prestare, domandare,
 * costare... all end in those strings but are perfectly regular. */
const DARE_FAMILY  = new Set(["dare","ridare"]);
const STARE_FAMILY = new Set(["stare","ristare","sottostare"]);
const ANDARE_FAMILY= new Set(["andare","riandare"]);

/* ------------------------------------------------------------------ *
 * 2. -ire VERBS THAT DO **NOT** TAKE -isc-                            *
 *    This is the closed class; everything else -ire is -isc-.         *
 *    Listed as suffixes so prefixed compounds are caught automatically *
 *    (ripartire, scoprire, proseguire, risentire, intervenire...).     *
 * ------------------------------------------------------------------ */
const NON_ISC_ROOTS = [
  "aprire","coprire","offrire","soffrire",
  "dormire","sentire","partire","seguire","servire","vestire","bollire",
  "fuggire","cucire","avvertire","vertire","pentire","mentire","sortire",
  "venire","uscire","salire","morire","udire","riempire","apparire",
  "nutrire","divertire","convertire","investire"
];
/* explicit extras that don't fall out of the suffix list */
const NON_ISC_EXACT = new Set(["aprire","coprire","offrire","soffrire","dormire",
  "sentire","partire","seguire","servire","vestire","bollire","fuggire","cucire",
  "avvertire","pentire","mentire","venire","uscire","salire","morire","udire",
  "riempire","apparire","comparire","scomparire","nutrire","divertire",
  "convertire","pentire","proseguire","inseguire","conseguire"]);

/* -ire verbs we positively KNOW take -isc- (high confidence).
 * Unknown -ire verbs default to -isc- but are marked confidence:"low". */
const ISC_KNOWN = new Set([
  "capire","finire","preferire","pulire","spedire","costruire","chiarire",
  "reagire","agire","unire","riunire","punire","tradire","guarire","colpire",
  "sparire","definire","stabilire","garantire","gestire","contribuire",
  "distribuire","restituire","sostituire","istruire","diminuire","obbedire",
  "ubbidire","arrossire","dimagrire","ferire","fornire","impedire","inserire",
  "percepire","proibire","rapire","riferire","scolpire","seppellire","smarrire",
  "starnutire","stupire","subire","suggerire","svanire","trasferire","esaurire",
  "esibire","favorire","fallire","fiorire","arricchire","ammorbidire","custodire",
  "condire","gradire","impazzire","indebolire","ingrandire","irrigidire",
  "istituire","marcire","ostruire","patire","perquisire","ripulire","spedire",
  "sbalordire","costituire","chiarire","approfondire","concepire","aggredire",
  "colpire","preferire","obbedire","fiorire","attribuire"
]);

/* ------------------------------------------------------------------ *
 * 3. IRREGULAR PAST PARTICIPLES                                       *
 *    Exact keys; prefixed compounds are matched by longest suffix.    *
 * ------------------------------------------------------------------ */
const IRREG_PART = {
  essere:"stato", fare:"fatto",
  /* "stare" is likewise NOT a key: it is a suffix of restare / prestare /
     costare / sovrastare, which are all regular (-ato). Handled via STARE_FAMILY. */
  /* NOTE: "dire" is deliberately NOT a key here -- it would match as a suffix of
     spedire / gradire / tradire / custodire / impedire / irrigidire / udire.
     dire-compounds are handled explicitly in participle() via DIRE_FAMILY. */
  mettere:"messo", prendere:"preso", scrivere:"scritto", leggere:"letto",
  vedere:"visto", aprire:"aperto", chiudere:"chiuso", rimanere:"rimasto",
  permanere:"permaso", scegliere:"scelto", cogliere:"colto", togliere:"tolto",
  sciogliere:"sciolto", decidere:"deciso", risolvere:"risolto",
  assolvere:"assolto", evolvere:"evoluto", spegnere:"spento",
  offrire:"offerto", soffrire:"sofferto", coprire:"coperto",
  bere:"bevuto", vivere:"vissuto", nascere:"nato", morire:"morto",
  correre:"corso", rispondere:"risposto", chiedere:"chiesto",
  perdere:"perso", rompere:"rotto", spingere:"spinto", giungere:"giunto",
  ungere:"unto", pingere:"pinto", vincere:"vinto", piangere:"pianto",
  stringere:"stretto", distinguere:"distinto", discutere:"discusso",
  muovere:"mosso", scuotere:"scosso", esprimere:"espresso",
  comprimere:"compresso", succedere:"successo", concedere:"concesso",
  offendere:"offeso", difendere:"difeso", accendere:"acceso",
  scendere:"sceso", spendere:"speso", rendere:"reso", attendere:"atteso",
  intendere:"inteso", estendere:"esteso", tendere:"teso",
  nascondere:"nascosto", confondere:"confuso", fondere:"fuso",
  ridere:"riso", dividere:"diviso", uccidere:"ucciso", radere:"raso",
  deludere:"deluso", includere:"incluso", alludere:"alluso",
invadere:"invaso", persuadere:"persuaso",
  evadere:"evaso", correggere:"corretto", eleggere:"eletto",
  proteggere:"protetto", reggere:"retto", dirigere:"diretto",
  redigere:"redatto", friggere:"fritto", struggere:"strutto",
  cuocere:"cotto", condurre:"condotto", porre:"posto", trarre:"tratto",
  volgere:"volto", accorgere:"accorto", scorgere:"scorto",
  porgere:"porto", sorgere:"sorto", spargere:"sparso", emergere:"emerso",
  immergere:"immerso", assumere:"assunto", presumere:"presunto",
  esistere:"esistito", insistere:"insistito", assistere:"assistito",
  resistere:"resistito", consistere:"consistito", parere:"parso",
  apparire:"apparso", comparire:"comparso", scomparire:"scomparso",
  valere:"valso", crescere:"cresciuto", conoscere:"conosciuto",
  piacere:"piaciuto", tacere:"taciuto", giacere:"giaciuto",
  venire:"venuto", scoprire:"scoperto",
  sorridere:"sorriso",   interrompere:"interrotto", aggiungere:"aggiunto", raggiungere:"raggiunto",
  imporre:"imposto", comporre:"composto", proporre:"proposto",
  esporre:"esposto", supporre:"supposto", disporre:"disposto",
  produrre:"prodotto", tradurre:"tradotto", ridurre:"ridotto",
  introdurre:"introdotto", attrarre:"attratto", distrarre:"distratto",
  raccogliere:"raccolto", accogliere:"accolto", distogliere:"distolto",
  svolgere:"svolto", risalire:"risalito", assalire:"assalito",
  ludere:"luso", cludere:"cluso", primere:"presso", mergere:"merso",
  estinguere:"estinto", dissolvere:"dissolto", cidere:"ciso",
  fingere:"finto", compiere:"compiuto"
};

/* -ere verbs whose participle really is the regular -uto (so we can claim
 * high confidence). Everything else in -ere that is not in IRREG_PART is
 * reported with confidence:"low". */
const REG_ERE_PART = new Set([
  "credere","ripetere","temere","vendere","ricevere","battere","godere",
  "cadere","sedere","potere","dovere","volere","sapere","tenere","avere",
  "premere","spremere","combattere","abbattere","sbattere","possedere",
  "ottenere","mantenere","sostenere","ritenere","trattenere","appartenere",
  "contenere","dispiacere","piovere","potere","dovere","vendere","cedere",
  "procedere","ricadere","accadere","sedere","riavere","tessere","fendere"
]);

/* ------------------------------------------------------------------ *
 * 4. AUXILIARY                                                        *
 * ------------------------------------------------------------------ */
const AUX_ESSERE = new Set([
  "essere","stare","andare","venire","arrivare","partire","ripartire",
  "uscire","riuscire","entrare","rientrare","tornare","ritornare","restare",
  "rimanere","permanere","diventare","divenire","nascere","morire","cadere",
  "ricadere","accadere","succedere","avvenire","capitare","intervenire",
  "provenire","svenire","sembrare","parere","apparire","comparire",
  "scomparire","sparire","piacere","dispiacere","bastare","costare","durare",
  "esistere","giungere","fuggire","scappare","invecchiare","ingrassare",
  "dimagrire","arrossire","impazzire","emergere","sorgere","scoppiare",
  "sopravvivere","evadere","partire","giacere","piovere","nevicare",
  "occorrere","riuscire","andarsene","stare"
]);

/* Verbs that legitimately take BOTH auxiliaries depending on transitivity.
 * These return aux as a TWO-ELEMENT ARRAY rather than a single string, so the
 * drill can show both rather than silently committing to one.
 *
 * ORDER = which reading is more frequent in ordinary use, and is a DISPLAY
 * choice, not a correctness claim: both members are correct Italian.
 *   "avere" first  -> the transitive reading is the everyday one
 *                     (ho finito il lavoro / ho cambiato idea)
 *   "essere" first -> the intransitive reading is the everyday one
 *                     (i prezzi sono aumentati / sono cresciuto a Roma)
 * Consumers that can only handle one auxiliary may read aux[0] and get the
 * more common reading; for `finire` and `vivere` that is "avere", i.e. exactly
 * what the hand-written tables in app.js already stored.
 *
 * Agreement note: only the ESSERE form agrees with the subject. The AVERE
 * form is invariable.
 */
const AUX_DUAL = new Map([
  /* transitive reading is the everyday one */
  ["cambiare",     ["avere", "essere"]],   // ho cambiato idea / e' cambiato tutto
  ["cominciare",   ["avere", "essere"]],   // ho cominciato il corso / il film e' cominciato
  ["ricominciare", ["avere", "essere"]],
  ["iniziare",     ["avere", "essere"]],
  ["continuare",   ["avere", "essere"]],   // ho continuato a leggere / la pioggia e' continuata
  ["finire",       ["avere", "essere"]],   // ho finito il lavoro / il film e' finito
  ["terminare",    ["avere", "essere"]],
  ["vivere",       ["avere", "essere"]],   // ho vissuto a Roma / e' vissuto nel '900
  ["bruciare",     ["avere", "essere"]],   // ho bruciato la lettera / la casa e' bruciata
  ["migliorare",   ["avere", "essere"]],
  ["peggiorare",   ["avere", "essere"]],
  ["servire",      ["avere", "essere"]],   // ho servito i clienti / mi e' servito
  /* intransitive reading is the everyday one */
  ["aumentare",    ["essere", "avere"]],   // i prezzi sono aumentati / hanno aumentato i prezzi
  ["diminuire",    ["essere", "avere"]],
  ["crescere",     ["essere", "avere"]],   // sono cresciuto / ho cresciuto i figli
  ["salire",       ["essere", "avere"]],   // sono salito / ho salito le scale
  ["scendere",     ["essere", "avere"]],
  ["passare",      ["essere", "avere"]],   // sono passato / ho passato l'esame
  ["correre",      ["essere", "avere"]],
  ["volare",       ["essere", "avere"]],
  ["saltare",      ["essere", "avere"]],
  ["avanzare",     ["essere", "avere"]],
  ["procedere",    ["essere", "avere"]],
  ["guarire",      ["essere", "avere"]],   // e' guarito / il medico l'ha guarito
  ["mancare",      ["essere", "avere"]],
  ["affogare",     ["essere", "avere"]],
  ["annegare",     ["essere", "avere"]]
]);

/* ------------------------------------------------------------------ *
 * 5. -iare verbs with a STRESSED i (invìo -> invii, not *invi)         *
 * ------------------------------------------------------------------ */
/* -iare verbs whose i is certainly UNSTRESSED -- listed so they keep
 * confidence "high" and the low-confidence list stays meaningful. */
const UNSTRESSED_IARE = new Set([
  "studiare","cambiare","risparmiare","odiare","copiare","ringraziare",
  "rischiare","annoiare","annoiarsi","arrabbiare","arrabbiarsi","invidiare",
  "appoggiare","assomigliare","cacciare","fischiare","incendiare","iniziare",
  "macchiare","premiare","raddoppiare","abbaiare","tagliare",
  "sbagliare","consigliare","svegliare","viaggiare","somigliare","scambiare"
]);

const STRESSED_IARE = new Set([
  "inviare","sciare","spiare","avviare","deviare","obliare","espiare",
  "sviare","rinviare","ampliare","variare"
]);

/* Verbs whose CONJUGATION is certain but whose presence in a corpus is
 * doubtful, because the same string is far more often another part of speech.
 * Surfaced as `review` so a teacher can check the source sentences. */
const LEXICAL_DOUBT = new Map([
  ["regolare", "also a very common adjective (\"regular\"); in Italian text the " +
               "adjective is more frequent than the verb \"to regulate\". Check the " +
               "source sentences before putting it in the drill."],
  ["capitare",  "impersonal in most uses (\"capita che...\"); a full six-person table may read oddly."],
  ["occorrere", "impersonal in most uses (\"occorre che...\"); a full six-person table may read oddly."],
  ["bisognare", "impersonal only (\"bisogna che...\"); the personal forms are not used."],
  ["piovere",   "impersonal; the personal forms are not used."]
]);

/* Tokens that reach this module from corpus extraction but are not verbs. */
const NOT_A_VERB = new Set([
  "carattere","particolare","diversi","militare","familiare",
  "singolare","volgare","secolare","scolare","cellulare","nucleare"
]);

/* ------------------------------------------------------------------ *
 * Helpers                                                             *
 * ------------------------------------------------------------------ */
const IMPF_ENDINGS = ["ssi","ssi","sse","ssimo","ste","ssero"];

function matchSuffix(word, table) {
  let best = null;
  for (const key of Object.keys(table)) {
    const k = key.replace(/_$/, "").replace(/_NO$/, "");
    if (key.endsWith("_NO")) continue;
    if (k.length < 4) continue;
    if (word === k || (word.length > k.length && word.endsWith(k))) {
      if (!best || k.length > best.key.length) {
        best = { key: k, prefix: word.slice(0, word.length - k.length), value: table[key] };
      }
    }
  }
  return best;
}

function irregStems(inf) {
  if (Object.prototype.hasOwnProperty.call(IRREG_PRES, inf)) return IRREG_PRES[inf];
  if (DIRE_FAMILY.has(inf))  return [inf.slice(0, -4) + "dico", inf.slice(0, -4) + "diciamo"];
  if (DARE_FAMILY.has(inf))  return ["*" + inf.slice(0, -4) + "di", inf.slice(0, -4) + "diamo"];
  if (STARE_FAMILY.has(inf)) return ["*" + inf.slice(0, -5) + "sti", inf.slice(0, -5) + "stiamo"];
  if (ANDARE_FAMILY.has(inf))return [inf.slice(0, -6) + "vado", inf.slice(0, -6) + "andiamo"];
  for (const [suf, fn] of IRREG_SUFFIX) {
    if (inf.length > suf.length && inf.endsWith(suf)) return fn(inf.slice(0, inf.length - suf.length));
    if (inf === suf) return fn("");
  }
  return null;
}

function presenteFromStems(io, noi) {
  const sg  = io.startsWith("*") ? io.slice(1) : io.replace(/o$/, "");
  const nst = noi.replace(/iamo$/, "");
  return [sg + "a", sg + "a", sg + "a", noi, nst + "iate", sg + "ano"];
}

function regularPresente(inf) {
  if (inf.endsWith("are")) {
    const stem = inf.slice(0, -3);
    if (/[cg]$/.test(stem)) {                       // cercare -> cerchi, spiegare -> spieghi
      return [stem+"hi", stem+"hi", stem+"hi", stem+"hiamo", stem+"hiate", stem+"hino"];
    }
    if (/i$/.test(stem)) {                          // mangiare / studiare / cominciare
      if (STRESSED_IARE.has(inf)) {                 // inviare -> invii
        return [stem+"i", stem+"i", stem+"i", stem+"amo", stem+"ate", stem+"ino"];
      }
      return [stem, stem, stem, stem+"amo", stem+"ate", stem+"no"];
    }
    return [stem+"i", stem+"i", stem+"i", stem+"iamo", stem+"iate", stem+"ino"];
  }
  if (inf.endsWith("ere")) {
    const stem = inf.slice(0, -3);
    return [stem+"a", stem+"a", stem+"a", stem+"iamo", stem+"iate", stem+"ano"];
  }
  if (inf.endsWith("ire")) {
    const stem = inf.slice(0, -3);
    if (isIsc(inf)) {
      return [stem+"isca", stem+"isca", stem+"isca", stem+"iamo", stem+"iate", stem+"iscano"];
    }
    return [stem+"a", stem+"a", stem+"a", stem+"iamo", stem+"iate", stem+"ano"];
  }
  return null;
}

function isIsc(inf) {
  if (ISC_KNOWN.has(inf)) return true;
  if (NON_ISC_EXACT.has(inf)) return false;
  for (const r of NON_ISC_ROOTS) {
    if (r.endsWith("_NO")) continue;
    if (inf === r || (inf.length > r.length && inf.endsWith(r))) return false;
  }
  return true;   // statistical default: the -isc- class is the open one
}
function iscKnown(inf) {
  if (ISC_KNOWN.has(inf) || NON_ISC_EXACT.has(inf)) return true;
  for (const r of NON_ISC_ROOTS) {
    if (inf === r || (inf.length > r.length && inf.endsWith(r))) return true;
  }
  return false;
}

/* imperfetto stem: infinitive minus -re, with a closed exception list */
function imperfettoStem(inf) {
  if (inf === "essere") return { stem: "fo", irr: true };
  if (DARE_FAMILY.has(inf))  return { stem: inf.slice(0, -4) + "de",  irr: true };
  if (STARE_FAMILY.has(inf)) return { stem: inf.slice(0, -5) + "ste", irr: true };
  if (DIRE_FAMILY.has(inf))  return { stem: inf.slice(0, -4) + "dice", irr: true };
  if (inf === "bere")        return { stem: "beve", irr: true };
  if (inf.endsWith("fare"))  return { stem: inf.slice(0, -4) + "face", irr: true };
  if (inf.endsWith("durre")) return { stem: inf.slice(0, -5) + "duce", irr: true };
  if (inf.endsWith("porre")) return { stem: inf.slice(0, -5) + "pone", irr: true };
  if (inf.endsWith("trarre"))return { stem: inf.slice(0, -6) + "trae", irr: true };
  return { stem: inf.slice(0, -2), irr: false };
}

/* past participle */
function participle(inf) {
  if (DIRE_FAMILY.has(inf)) return { part: inf.slice(0, -4) + "detto", irr: true, known: true };
  if (STARE_FAMILY.has(inf)) return { part: inf.slice(0, -5) + "stato", irr: true, known: true };
  const hit = matchSuffix(inf, IRREG_PART);
  if (hit) return { part: hit.prefix + hit.value, irr: true, known: true };
  if (inf.endsWith("are")) return { part: inf.slice(0, -3) + "ato", irr: false, known: true };
  if (inf.endsWith("ire")) return { part: inf.slice(0, -3) + "ito", irr: false, known: true };
  if (inf.endsWith("ere")) {
    const stem = inf.slice(0, -3);
    // -cere / -scere soften to -ciuto / -sciuto (piaciuto, conosciuto)
    const p = /sc$|c$/.test(stem) ? stem + "iuto" : stem + "uto";
    let known = false;
    for (const k of REG_ERE_PART) {
      if (inf === k || (inf.length > k.length && inf.endsWith(k) && k.length >= 5)) { known = true; break; }
    }
    return { part: p, irr: false, known };
  }
  if (inf.endsWith("urre")) return { part: inf.slice(0, -4) + "otto", irr: true, known: true };
  if (inf.endsWith("orre")) return { part: inf.slice(0, -4) + "osto", irr: true, known: true };
  if (inf.endsWith("arre")) return { part: inf.slice(0, -4) + "atto", irr: true, known: true };
  return null;
}

function auxFor(inf, reflexive) {
  if (reflexive) return { aux: "essere", sure: true, dual: false };
  // Both auxiliaries are returned, so nothing is being guessed: confidence stays high.
  if (AUX_DUAL.has(inf)) return { aux: AUX_DUAL.get(inf).slice(), sure: true, dual: true };
  if (AUX_ESSERE.has(inf)) return { aux: "essere", sure: true, dual: false };
  // NO suffix matching here: "mandare" ends in "andare", "prestare" in "stare",
  // "raggiungere" in "giungere" -- all of which take avere. Explicit list only.
  return { aux: "avere", sure: true, dual: false };
}


/* ------------------------------------------------------------------ *
 * 6. PAST-PARTICIPLE AGREEMENT                                        *
 *                                                                     *
 * Every Italian past participle used in a compound tense ends in -o    *
 * and inflects -o / -a / -i / -e. This holds for the regular endings   *
 * (-ato, -uto, -ito) AND for every irregular one this module can       *
 * produce (-tto, -sto, -so, -sso, -lto, -nto, -rto, -rso, -otto ...):  *
 *   fatto/fatta/fatti/fatte, rimasto/rimasta/rimasti/rimaste,          *
 *   preso/presa/presi/prese, morto/morta/morti/morte,                  *
 *   conosciuto/conosciuta/conosciuti/conosciute.                       *
 * There is NO participle in this module's output that departs from     *
 * that pattern, and no orthographic complication (no participle ends   *
 * in -co or -go, so no -chi/-ghi plurals arise). assertAgreeable()     *
 * below is run by the test suite over every generated participle.      *
 *                                                                     *
 * WHERE agreement applies:                                            *
 *   essere  -> participle AGREES WITH THE SUBJECT (obligatory)         *
 *   avere   -> participle is INVARIABLE (masc. sg. form)               *
 *              [the preceding-direct-object-pronoun rule, "le ho       *
 *               viste", is a separate rule and is not modelled here]   *
 *   reflexive (always essere) -> agrees with the subject               *
 * ------------------------------------------------------------------ */

export function agree(part) {
  if (typeof part !== "string" || !part.endsWith("o")) return null;
  const b = part.slice(0, -1);
  return { ms: b + "o", fs: b + "a", mp: b + "i", fp: b + "e" };
}

/** true iff `part` follows the regular -o/-a/-i/-e agreement pattern. */
export function assertAgreeable(part) {
  return typeof part === "string" && /o$/.test(part) && !/[cg]o$/.test(part);
}

/** Agreement slot for a person index: 0-2 singular, 3-5 plural. */
export function agreementSlot(i, gender) {
  const g = gender === "f" ? "f" : "m";
  return (i < 3 ? g + "s" : g + "p");
}

const AUX_TABLES = {
  avere:  { presente:  ["abbia","abbia","abbia","abbiamo","abbiate","abbiano"],
            imperfetto: ["avessi","avessi","avesse","avessimo","aveste","avessero"] },
  essere: { presente:  ["sia","sia","sia","siamo","siate","siano"],
            imperfetto: ["fossi","fossi","fosse","fossimo","foste","fossero"] }
};

/**
 * Build congiuntivo passato / trapassato from aux + participle.
 *
 *   compoundForms("andare", "passato")
 *     -> [["sia andato/a"], ["sia andato/a"], ["sia andato/a"],
 *         ["siamo andati/e"], ["siate andati/e"], ["siano andati/e"]]
 *   compoundForms("cambiare", "passato")
 *     -> [["abbia cambiato", "sia cambiato/a"], ...]        // dual auxiliary
 *   compoundForms("fermarsi", "trapassato")
 *     -> [["mi fossi fermato/a"], ...]                      // clitic kept
 *
 * @param {string|object} input     infinitive, or a result of conjugate()
 * @param {"passato"|"trapassato"} tense
 * @param {{gender?:"m"|"f"|"both"}} [opts]  default "both" -> "andato/a"
 * @returns {string[][]|null} six entries, one string per auxiliary
 */
export function compoundForms(input, tense, opts = {}) {
  const e = typeof input === "string" ? conjugate(input) : input;
  if (!e) return null;
  const slot = tense === "passato" ? "presente" : tense === "trapassato" ? "imperfetto" : null;
  if (!slot) return null;
  const g = opts.gender || "both";
  const ag = agree(e.part);
  if (!ag) return null;
  const auxes = Array.isArray(e.aux) ? e.aux : [e.aux];
  const out = [];
  for (let i = 0; i < 6; i++) {
    const row = [];
    for (const a of auxes) {
      let pp;
      if (a === "avere") {
        pp = ag.ms;                                   // invariable with avere
      } else {
        const m = i < 3 ? ag.ms : ag.mp;
        const f = i < 3 ? ag.fs : ag.fp;
        pp = g === "m" ? m : g === "f" ? f : m + "/" + f.slice(m.length - 1);
      }
      const head = e._reflexive ? PRON[i] + " " + AUX_TABLES[a][slot][i] : AUX_TABLES[a][slot][i];
      row.push(head + " " + pp);
    }
    out.push(row);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Public API                                                          *
 * ------------------------------------------------------------------ */
export function conjugate(infinitive) {
  if (typeof infinitive !== "string") return null;
  let inf = infinitive.trim().toLowerCase();
  if (!inf) return null;
  if (NOT_A_VERB.has(inf)) return null;

  /* reflexive: fermarsi -> fermare, accorgersi -> accorgere, evolversi -> evolvere */
  let reflexive = false;
  if (/rsi$/.test(inf)) { reflexive = true; inf = inf.slice(0, -2) + "e"; }  // fermarsi -> fermare

  if (!/(?:are|ere|ire|urre|orre|arre)$/.test(inf)) return null;
  if (inf.length < 4) return null;

  let lowReasons = [];

  /* --- congiuntivo presente --- */
  let presente, irregularPres = false;
  const st = irregStems(inf);
  if (st) { presente = presenteFromStems(st[0], st[1]); irregularPres = true; }
  else {
    presente = regularPresente(inf);
    if (!presente) return null;
    if (inf.endsWith("ire") && !iscKnown(inf)) {
      lowReasons.push("-ire verb not in the -isc-/non--isc- lists; assumed -isc-");
    }
    if (inf.endsWith("are") && /i$/.test(inf.slice(0, -3)) && !STRESSED_IARE.has(inf)
        && !UNSTRESSED_IARE.has(inf) && !UNSTRESSED_IARE.has(infinitive.trim().toLowerCase())
        && !/[cg]i$/.test(inf.slice(0, -3)) && !/gli$/.test(inf.slice(0, -3))) {
      lowReasons.push("-iare verb: assumed unstressed i (one -i-, not -ii-)");
    }
  }

  /* --- congiuntivo imperfetto --- */
  const ist = imperfettoStem(inf);
  const imperfetto = IMPF_ENDINGS.map(e => ist.stem + e);

  /* --- participle --- */
  const pp = participle(inf);
  if (!pp) return null;
  if (!pp.known) lowReasons.push("-ere verb with no attested participle in the table; regular -uto assumed");

  /* --- auxiliary --- */
  const ax = auxFor(inf, reflexive);
  if (!ax.sure) lowReasons.push("verb takes BOTH auxiliaries depending on transitivity; \"" + ax.aux + "\" chosen");

  const out = {
    presente: reflexive ? presente.map((f, i) => PRON[i] + " " + f) : presente.slice(),
    imperfetto: reflexive ? imperfetto.map((f, i) => PRON[i] + " " + f) : imperfetto,
    aux: ax.aux,
    part: pp.part,
    partForms: agree(pp.part),      // {ms, fs, mp, fp} -- agreement with essere
    reflexive: reflexive,
    irregular: irregularPres || pp.irr || ist.irr,
    confidence: lowReasons.length ? "low" : "high"
  };
  Object.defineProperty(out, "_reflexive", { value: reflexive, enumerable: false });
  const doubt = LEXICAL_DOUBT.get(infinitive.trim().toLowerCase()) || LEXICAL_DOUBT.get(inf);
  if (doubt) out.review = doubt;
  if (!assertAgreeable(pp.part)) {
    lowReasons.push("participle \"" + pp.part + "\" does not end in -o: agreement forms are unreliable");
    out.confidence = "low";
  }
  Object.defineProperty(out, "notes", { value: lowReasons, enumerable: false });
  return out;
}

export function explain(infinitive) {
  const r = conjugate(infinitive);
  return r ? { ...r, notes: r.notes } : null;
}

export default conjugate;
