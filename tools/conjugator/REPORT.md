# Rule-based Italian subjunctive conjugator — validation report

**Revision 2 — 2026-08-21** (dual auxiliaries, participle agreement, data file)

| file | what it is |
|---|---|
| `conjugator.mjs` | the module: `conjugate()`, `agree()`, `compoundForms()`, `agreementSlot()`, `assertAgreeable()` |
| `test-conjugator.mjs` | validation against the 46 hand-written tables — `node test-conjugator.mjs` |
| `build-verbs.mjs` | regenerates the data file — `node build-verbs.mjs` |
| `verbs.generated.json` | 112 finished entries, ready to embed |

Nothing in `shadowing-studio/` was modified; `app.js` is read only, by both the
test and the builder.

---

## 0. What changed in revision 2

1. **`aux` may now be an array.** Seven of the 112 verbs take both auxiliaries
   and now return e.g. `["avere","essere"]` instead of a silently-chosen one.
2. **Participle agreement is exported.** Every entry carries
   `partForms: {ms, fs, mp, fp}`, and `compoundForms()` assembles congiuntivo
   passato/trapassato correctly — including the reflexive clitic and the
   avere-invariable / essere-agreeing distinction.
3. **The test now separates deliberate corrections from regressions.**
   `finire` and `vivere` differ from the hand-written tables *by design*; both
   are declared in an allow-list with field, exact old value, exact new value
   and a reason. Anything else still fails.
4. **`verbs.generated.json`** — 112 entries (46 existing + 66 corpus).

> **Read §4.1 before reading the numbers.** The count of low-confidence
> entries fell from 5 to 0, but **not because anything new was verified**. It
> fell because the auxiliary ambiguity is now *represented* rather than
> guessed, so it is no longer an unresolved doubt. The things a human should
> look at are in §6; the list did not get shorter, it changed shape.

---

## 1. Headline numbers

| | |
|---|---|
| Ground-truth tables reproduced exactly | **44 / 46** |
| Deliberate, declared corrections | **2** (`finire`, `vivere` — auxiliary only) |
| Undeclared differences (regressions) | **0** |
| Individual fields | 642 identical + 2 declared corrections + **0 unexplained** = 644 |
| Participles inflecting regularly `-o/-a/-i/-e` | **46 / 46**, and 112 / 112 in the data file |
| Verbs in `verbs.generated.json` | **112** (46 existing + 66 corpus) |
| — dual auxiliary | 7 |
| — reflexive | 10 |
| — `confidence: "low"` | **0** |
| — carrying a `review` flag | 1 (`regolare`) |
| Drill coverage | 46 hand-written → **112** |

---

## 2. Task 1 — dual auxiliaries

### 2.1 The seven verbs in the 112

| verb | `aux` | transitive (avere) | intransitive (essere) |
|---|---|---|---|
| cambiare | `["avere","essere"]` | ho cambiato idea | è cambiato tutto |
| cominciare | `["avere","essere"]` | ho cominciato il corso | il film è cominciato |
| ricominciare | `["avere","essere"]` | " | " |
| continuare | `["avere","essere"]` | ho continuato a leggere | la pioggia è continuata |
| **finire** | `["avere","essere"]` | ho finito il lavoro | il film è finito |
| **vivere** | `["avere","essere"]` | ho vissuto a Roma | è vissuto nel Novecento |
| aumentare | `["essere","avere"]` | hanno aumentato i prezzi | i prezzi sono aumentati |

**Order is a display choice, not a correctness claim** — both members are
correct Italian. `aux[0]` is the reading I judge more common. Note that for
`finire` and `vivere` `aux[0]` is `"avere"`, i.e. **exactly what the
hand-written tables already stored**, so a consumer that can only handle one
auxiliary can read `aux[0]` and behave as before.

### 2.2 Twenty more dual verbs are in the module

They do not appear in the 112 but will fire if the corpus grows. Adding a verb
to this list is a linguistic claim, so here it is in full for checking:

- *avere first (transitive reading is the everyday one):* iniziare, terminare,
  bruciare, migliorare, peggiorare, servire
- *essere first (intransitive reading is the everyday one):* diminuire,
  crescere, salire, scendere, passare, correre, volare, saltare, avanzare,
  procedere, guarire, mancare, affogare, annegare

I am confident every one of these genuinely takes both. I am **less sure about
the order** for `correre`, `passare`, `saltare`, `volare`, `aumentare`,
`diminuire`, `servire` and `mancare` — see §6.

### 2.3 The test was not weakened

`KNOWN_CORRECTIONS` in `test-conjugator.mjs` matches on **verb + field + exact
old value + exact new value**, and records a reason. Verified by deliberately
breaking a copy of the module:

- changing `dovere` to `deva/devano` → **FAIL**, reported form by form;
- giving `finire` the *wrong* dual value `["essere","avere"]` — same verb, same
  field as a declared correction → **FAIL**, not absorbed by the allow-list;
- a declared correction that stops occurring → **FAIL** as a stale entry, so
  the list cannot rot into a blanket exemption.

The test also now asserts, for all 46, that the participle inflects regularly
and that both compound tenses assemble.

---

## 3. Task 2 — participle agreement

### 3.1 The rule, and which participles break it

**None break it.** Every Italian past participle used in a compound tense ends
in `-o` and inflects `-o / -a / -i / -e`. That holds for the regular endings
(`-ato`, `-uto`, `-ito`) **and for every irregular participle this module can
produce**:

```
fatto/fatta/fatti/fatte      rimasto/rimasta/rimasti/rimaste
preso/presa/presi/prese      morto/morta/morti/morte
scelto/scelta/scelti/scelte  conosciuto/conosciuta/conosciuti/conosciute
aperto/aperta/aperti/aperte  interrotto/interrotta/interrotti/interrotte
```

There is no orthographic complication either: no participle ends in `-co` or
`-go`, so no `-chi/-ghi` plurals arise. `assertAgreeable()` checks this and the
test runs it over every generated participle — 112/112 pass. **So the answer to
"which participles do not follow the regular pattern" is: none of them, and the
test will tell you if that ever stops being true.**

The real irregularity in participles is in the *masculine singular itself*
(`fare → fatto`, not `*facuto`), which §3.2 of revision 1 covered and which the
irregular table handles. Agreement on top of it is exceptionless.

### 3.2 Where agreement applies

| auxiliary | participle |
|---|---|
| **avere** | **invariable** — always `part` (masculine singular): *che io abbia parlato* |
| **essere** | **agrees with the subject** — obligatory: *che lei sia andata*, *che noi siamo andati* |
| **reflexive** (always essere) | agrees with the subject: *che noi ci siamo fermati* |

Not modelled: the preceding-direct-object-pronoun rule with *avere*
(*le ho viste*). It needs a pronoun the drill does not show, so it cannot arise
here.

### 3.3 The gender problem the drill has to face

Persons **io, tu, lui/lei, loro** are gender-ambiguous in a conjugation table.
There is no single right form to print for *"che io sia andat‑"*. The module's
default is to show both, singular for persons 1–3 and plural for 4–6:

```
compoundForms("andare", "passato")
  sia andato/a · sia andato/a · sia andato/a · siamo andati/e · siate andati/e · siano andati/e

compoundForms("fermarsi", "trapassato")
  mi fossi fermato/a · ti fossi fermato/a · si fosse fermato/a
  ci fossimo fermati/e · vi foste fermati/e · si fossero fermati/e

compoundForms("cambiare", "passato")        // dual auxiliary
  ["abbia cambiato", "sia cambiato/a"] · ... · ["abbiamo cambiato", "siamo cambiati/e"] · ...
```

`compoundForms(v, tense, {gender:"m"})` or `{gender:"f"}` gives a single form
per person instead. **Which of these three the drill shows is a teaching
decision, not a linguistic one** — see §6.

This is the defect revision 1 flagged: `Verb.part()` in app.js would have
produced *"che noi ci siamo **fermato**"*. It is fixed at the module boundary,
but only if app.js stops using its own lookup — see §5.

---

## 4. Task 3 — `verbs.generated.json`

112 entries. Shape:

```json
"fermarsi": {
  "en": "to stop (oneself)",
  "presente":   ["mi fermi","ti fermi","si fermi","ci fermiamo","vi fermiate","si fermino"],
  "imperfetto": ["mi fermassi","ti fermassi","si fermasse","ci fermassimo","vi fermaste","si fermassero"],
  "aux": "essere",
  "part": "fermato",
  "partForms": {"ms":"fermato","fs":"fermata","mp":"fermati","fp":"fermate"},
  "reflexive": true, "irregular": false, "confidence": "high"
}
```

`aux` is `"avere"` | `"essere"` | `[first, second]`. Reflexives keep their
clitics, as before. `_meta` documents every field, and `_meta.counts` carries
the numbers. Two optional fields:

- **`notes`** — present only when `confidence` is `"low"` (currently none),
  saying exactly what is uncertain;
- **`review`** — forms are certain but the *entry* is questionable. One verb
  carries it: **`regolare`**, which is far more often the adjective *"regular"*
  than the verb *"to regulate"*. Check the two source sentences.

Breakdown: 79 avere-only, 26 essere-only, 7 dual; 10 reflexive; 4 tokens
excluded (`carattere`, `particolare`, `diversi` — not verbs; `occorre` — a
verb form but not an infinitive, see §6).

---

## 5. Does runtime derivation of compound tenses still work?

**Yes — keep deriving at runtime. Do not store compound forms.** But the two
functions in app.js that do it today must both be replaced; neither survives
this change.

**What breaks now:**

1. `Verb.forms()` does `this.V[d.aux][...]` — it *indexes the verb table by the
   auxiliary string*. With `d.aux === ["avere","essere"]` that lookup is
   `undefined` and throws.
2. `Verb.part(part, i)` pluralises from an 11-entry hard-coded map
   (`stato→stati`, `andato→andati`, …). It does not know the 66 new
   participles, and it has **no feminine forms at all** — so it cannot express
   agreement even for the verbs it does know.

**Why storing compounds is the wrong fix:** passato + trapassato × 6 persons ×
up to 2 auxiliaries × up to 2 genders is up to 48 additional strings per verb,
all mechanically derivable, and it would force the gender decision at
data-build time instead of at display time, where it belongs.

**Replacement** — either import `compoundForms` from the module, or inline
this, which is the whole of it:

```js
const AUXT = {
  avere:  {presente:["abbia","abbia","abbia","abbiamo","abbiate","abbiano"],
           imperfetto:["avessi","avessi","avesse","avessimo","aveste","avessero"]},
  essere: {presente:["sia","sia","sia","siamo","siate","siano"],
           imperfetto:["fossi","fossi","fosse","fossimo","foste","fossero"]}
};
forms(v, t) {
  const d = this.V[v];
  if (t === "presente" || t === "imperfetto") return d[t];
  const slot = (t === "passato") ? "presente" : "imperfetto";
  const auxes = Array.isArray(d.aux) ? d.aux : [d.aux];
  return [0,1,2,3,4,5].map(i => auxes.map(a => {
    // avere: invariable.  essere: agrees -- singular for i<3, plural for i>=3.
    const pp = (a === "avere") ? d.part
             : (i < 3 ? d.partForms.ms + "/" + d.partForms.fs.slice(-1)
                      : d.partForms.mp + "/" + d.partForms.fp.slice(-1));
    return (d.reflexive ? PRON[i] + " " : "") + AUXT[a][slot][i] + " " + pp;
  }).join(" / "));
}
```

Three things to keep in mind when wiring it up: `d.aux` may be an array;
the clitic goes **before** the auxiliary (*mi sia fermato*, not *sia mi
fermato*); and `Verb.detect()` also reads `d.part`, which still works because
`part` remains the plain masculine singular string.

---

## 6. What a human Italian speaker should still check

Short, and in priority order. Items 1–3 are new in this revision.

1. **The order inside the seven dual pairs** (§2.1), and whether all seven
   should be dual at all. Both members are correct Italian; `aux[0]` is my
   judgement of which is more common. `aumentare` is the one I would most
   expect you to see differently — I have put **essere first** there, matching
   what you flagged in revision 1.
2. **The twenty further dual verbs** in §2.2 — a list, not a corpus finding.
   I am confident each takes both auxiliaries; the **order** for `correre`,
   `passare`, `saltare`, `volare`, `diminuire`, `servire` and `mancare` is a
   closer call than the rest.
3. **How to print gender-ambiguous persons** (§3.3): `andato/a` for io/tu/
   lui-lei, or pick one gender. This is a teaching decision. The module will
   produce whichever you choose; the *default* is to show both.
4. **`regolare`** (2 hits, carries `review` in the JSON) — verb *to regulate*,
   or the adjective *"regular"*? Check the two source sentences; if it is the
   adjective, add it to `NOT_A_VERB`.
5. **`occorre`** (10 hits) — a lemmatiser fix upstream in whatever builds
   `verb-gap.json`, not in this module: it should produce `occorrere`, which
   conjugates correctly (`occorra … occorressi …`, essere, `occorso`). Note
   that `occorrere` is nearly always impersonal, so a six-person table for it
   may read oddly — the module flags this with `review`.

**Unchanged limits** (no verb in the 112 is affected; all are auto-flagged
`confidence: "low"` if they ever come up): unknown `-ere` participles default
to `-uto` — the one conjugation where that is not safe; unknown `-ire` verbs
default to `-isc-`; unknown `-iare` verbs assume an unstressed `i`. Some verbs
also have a second participle the module does not offer (`perdere` →
perso/perduto, `vedere` → visto/veduto, `riflettere` → riflettuto/riflesso).
Only congiuntivo presente and imperfetto are generated; passato and trapassato
are assembled per §5.

Everything else — all 112 entries, all 46 ground-truth tables — I am confident
is correct, and the 46 are machine-verified against your own hand-written data
on every run of `test-conjugator.mjs`.
