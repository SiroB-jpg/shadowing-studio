# Setting up your sentence generator

This is a one-off job, done entirely in your web browser. Nothing to install,
no Terminal. Allow about fifteen minutes.

## What you are building, and why

Your app runs in a browser, and Google refuses to accept requests that come
straight from a web page. So we put a small piece of your own in between: it
sits on the internet, receives a request from your app, passes it to Google,
and hands the answer back. It also keeps your Google key out of the browser
entirely, and only answers to your app.

Cloudflare hosts this sort of thing free, and your usage will be nowhere near
their limits.

## Step 1 — Get a Google key

1. Go to `aistudio.google.com/apikey` and sign in with your Google account.
2. Click **Create API key**, and let it make a new project if it asks.
3. Copy the key somewhere safe for a few minutes. You will paste it in later.

## Step 2 — Invent a passphrase

Think of a phrase only you know — something like `arance-blu-quarantadue`.
Write it down. Your app will send this to your generator so that strangers
who find the address cannot use it. It is not a password to any account, and
you can change it whenever you like.

## Step 3 — Create the generator

1. Go to `dash.cloudflare.com/sign-up` and make a free account, or sign in if
   you already have one.
2. In the menu down the left, find **Workers & Pages**, then click the button
   to create a new Worker. Cloudflare offers a starter example; accept it.
3. Give it a name such as `italian-sentences`, and click **Deploy**.
   It will now exist, but do nothing useful yet.
4. Click **Edit code**. A code window opens containing the starter example.
5. Select everything in that window and delete it. Then open the file
   `worker.js` that came with this release, copy all of it, and paste it in.
6. Click **Deploy** (or **Save and deploy**).

## Step 4 — Give it its three settings

Still on your Worker's page, look for **Settings**, then a section named
something like **Variables and Secrets**. Add three entries.

| Name | Type | What to put |
|---|---|---|
| `GEMINI_API_KEY` | Secret | The Google key from step 1 |
| `APP_TOKEN` | Secret | Your passphrase from step 2 |
| `ALLOWED_ORIGIN` | Text | `https://sirob-jpg.github.io` |

Choose "Secret" (sometimes called "Encrypt") for the first two so they cannot
be read back afterwards. Save, and deploy once more if it asks.

Optionally add a fourth, `GEMINI_MODEL`, if you ever want a different Google
model. Leave it out and it uses `gemini-3.6-flash`.

## Step 5 — Connect your app

1. At the top of your Worker's page you will see its address, ending in
   `.workers.dev`. Copy it.
2. Open your app, go to **Settings**, and find **Sentence generator**.
3. Paste the address into **Generator address**, and type your passphrase into
   **Passphrase**.
4. Set **Save locally** to "save on this browser", then click
   **Save generator settings**.

## Step 6 — Try it

Go to the **Generate** tab, type a word such as `farcela`, choose ten
sentences, and press Generate. You should see a table of sentences within
several seconds. Press **Save to library** to keep them.

## If something goes wrong

The app tells you what happened in plain words. The usual causes:

- *"The passphrase in Settings does not match"* — the passphrase in the app
  and the `APP_TOKEN` on Cloudflare are different. Check for stray spaces.
- *"Your generator is set up for a different web address"* — `ALLOWED_ORIGIN`
  does not match where the app is running. It must have no trailing slash.
- *"missing one of its settings"* — one of the three entries in step 4 did not
  save, or was spelled differently.
- *"Could not reach your generator"* — the address in Settings is wrong, or
  the Worker was never deployed.
- *"free allowance is used up"* — Google's daily free quota is spent. It
  resets; nothing is broken.

## Housekeeping

Delete the two temporary keys you made while we were testing, at
`aistudio.google.com/apikey` and `console.groq.com/keys`. Keep only the key
that now lives on Cloudflare.

If you ever think your passphrase has got out, change `APP_TOKEN` on
Cloudflare and change it in the app's Settings to match.
