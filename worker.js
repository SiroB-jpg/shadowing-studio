/**
 * Italian Shadowing Studio — sentence generation relay
 *
 * Sits between the app and Google's Gemini API. It exists for three reasons:
 *   1. Google refuses calls made directly from a web page (CORS), so something
 *      server-side has to make the call.
 *   2. The API key stays here, never in the browser.
 *   3. The prompt is built here too, so a leaked passphrase yields Italian
 *      practice sentences and nothing else — not a general-purpose AI.
 *
 * Environment variables to set in the Cloudflare dashboard:
 *   GEMINI_API_KEY   (secret)   your Google AI Studio key
 *   APP_TOKEN        (secret)   passphrase the app must send
 *   ALLOWED_ORIGIN   (plain)    e.g. https://sirob-jpg.github.io
 *   GEMINI_MODEL     (plain)    optional, defaults below
 */

const DEFAULT_MODEL = "gemini-3.6-flash";
const MAX_SENTENCES = 25;    // per request; the app batches larger sets
const MAX_WORD_LEN  = 80;

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || "*";
    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-App-Token",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: { "Content-Type": "application/json", ...cors }
      });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method === "GET")     return json({ ok: true, service: "shadowing-studio relay" });
    if (request.method !== "POST")    return json({ error: "Use POST." }, 405);

    // ── Who's calling ────────────────────────────────────────────────────────
    if (!env.APP_TOKEN) return json({ error: "Relay is missing its APP_TOKEN setting." }, 500);
    if (request.headers.get("X-App-Token") !== env.APP_TOKEN)
      return json({ error: "Wrong or missing passphrase." }, 401);

    if (env.ALLOWED_ORIGIN) {
      const got = request.headers.get("Origin");
      if (got && got !== env.ALLOWED_ORIGIN)
        return json({ error: "This relay does not serve that address." }, 403);
    }

    if (!env.GEMINI_API_KEY) return json({ error: "Relay is missing its GEMINI_API_KEY setting." }, 500);

    // ── What's being asked for ───────────────────────────────────────────────
    let body;
    try { body = await request.json(); } catch { return json({ error: "Body was not valid JSON." }, 400); }

    const word = String(body.word || "").trim();
    if (!word) return json({ error: "No target word supplied." }, 400);
    if (word.length > MAX_WORD_LEN) return json({ error: "Target expression is too long." }, 400);

    const count = Math.min(Math.max(parseInt(body.count, 10) || 10, 1), MAX_SENTENCES);
    const avoid = Array.isArray(body.avoid) ? body.avoid.filter(s => typeof s === "string").slice(-40) : [];

    const prompt = buildPrompt({
      word, batch: count,
      tense: String(body.tense || "mixed"),
      register: String(body.register || "neutral"),
      english: body.english !== false,
      avoid
    });

    // ── Ask Google ───────────────────────────────────────────────────────────
    const model = env.GEMINI_MODEL || DEFAULT_MODEL;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${env.GEMINI_API_KEY}`;

    let upstream;
    try {
      upstream = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.85, responseMimeType: "application/json" }
        }),
        signal: AbortSignal.timeout(60000)
      });
    } catch (e) {
      return json({ error: "Could not reach Google: " + (e.message || e) }, 502);
    }

    const raw = await upstream.text();
    if (!upstream.ok) {
      // Never pass Google's response through verbatim — it can echo the key.
      const msg = upstream.status === 429
        ? "Google's free allowance is used up for now. Try again later."
        : `Google returned an error (${upstream.status}).`;
      return json({ error: msg }, upstream.status === 429 ? 429 : 502);
    }

    let text = "";
    try {
      const g = JSON.parse(raw);
      text = (g.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
    } catch {
      return json({ error: "Google's reply could not be read." }, 502);
    }

    const sentences = parseSentences(text);
    if (!sentences || !sentences.length)
      return json({ error: "No usable sentences came back. Try again." }, 502);

    return json({ sentences, model });
  }
};

// ── Prompt (kept identical to the wording tested against the corpus) ─────────
function buildPrompt(o) {
  const tense = o.tense === "mixed"
    ? "Spread the sentences naturally across a range of tenses and moods that a real speaker would use with this word; do not confine them to one tense."
    : `Every sentence must place the target expression in the ${o.tense}. Where the target word itself cannot carry that tense (for example a noun or an adverb), the main verb of the sentence must be in the ${o.tense}.`;
  const register = {
    neutral: "Use neutral, everyday contemporary Italian.",
    formal: "Use a formal, professional register suitable for work or study contexts.",
    colloquial: "Use relaxed, colloquial spoken Italian of the kind heard between friends.",
    literary: "Use a careful written register of the kind found in essays and quality journalism."
  }[o.register] || "Use neutral, everyday contemporary Italian.";
  return [
    "You write Italian shadowing material for an English-speaking adult learner.",
    "",
    `Target expression: "${o.word}".`,
    `Write exactly ${o.batch} sentences.`,
    "",
    "Rules:",
    "1. Every sentence must contain the target expression, correctly inflected for the grammar of that sentence. Pronominal and idiomatic expressions may appear in their split or conjugated forms.",
    "2. Each sentence must be sayable in one breath: roughly 6 to 14 words.",
    "3. Vary the grammatical person, the situation and the sentence shape across the set. Do not reuse the same opening twice.",
    "4. The Italian must be idiomatic and natural. Never produce a translation of an English sentence.",
    "5. " + tense,
    "6. " + register,
    o.english
      ? "7. Give an idiomatic English translation of each sentence — natural English, not word-for-word glossing."
      : "7. Leave every English field as an empty string.",
    "8. No numbering, no bullets, no surrounding quotation marks, no commentary.",
    o.avoid.length ? `9. Do not repeat any of these sentences already produced: ${o.avoid.map(s => '"' + s + '"').join("; ")}` : "",
    "",
    'Reply with JSON only, in this exact shape: {"sentences":[{"italian":"...","english":"..."}]}'
  ].filter(Boolean).join("\n");
}

function parseSentences(text) {
  let obj = null;
  try { obj = JSON.parse(text); }
  catch { const m = text.match(/\{[\s\S]*\}/); if (m) { try { obj = JSON.parse(m[0]); } catch {} } }
  if (!obj) return null;
  const list = Array.isArray(obj) ? obj : (obj.sentences || obj.items || obj.data || []);
  if (!Array.isArray(list)) return null;
  return list.map(x => typeof x === "string"
    ? { italian: x.trim(), english: "" }
    : { italian: String(x.italian || x.it || "").trim(), english: String(x.english || x.en || "").trim() }
  ).filter(x => x.italian);
}
