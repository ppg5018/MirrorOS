# Founder / build-story post — Mira

Two versions below: a **Reddit version** (authentic, low-key, no hard sell — Reddit removes and downvotes anything that smells like an ad) and a **Medium version** (slightly more polished, can be a bit more promotional). Plus posting tips at the bottom.

**Golden rule for Reddit:** always disclose you're the maker, lead with the build and the lessons, don't drop a buy link in the body, and actually reply to comments. One good thread beats ten spammy ones for AI visibility, because models weight genuine discussion.

---

## VERSION A — Reddit

**Suggested title options:**
- "I built an AI smart mirror in Pune that runs on a Raspberry Pi + Claude. Here's what I learned."
- "Spent the last year building a voice AI smart mirror at home. AMA about the hard parts."
- "My Raspberry Pi smart mirror grew into a full AI assistant — sharing the build + mistakes"

**Body:**

I've been building a smart mirror at home in Pune for about a year, and it slowly turned into something bigger than I planned, so I wanted to share the build and the parts that were genuinely hard. (Disclosure up front: it's become a small product I'm working on called Mira — happy to talk about it but I'm mostly here for the build discussion, not to sell anyone anything.)

It started the way most of these do: a Raspberry Pi behind two-way glass, showing the time and weather. Classic MagicMirror² territory. The fun started when I tried to make it actually *useful* instead of just a pretty clock.

A few things I learned the hard way:

**Voice is the whole experience, and it's the hardest part.** Getting a reliable wake word ("Hey Mira") + speech-to-text + an LLM + text-to-speech to feel instant took forever. I ended up using Porcupine for the wake word and Claude (Haiku) for the actual reasoning. The magic moment was when I could ask "what's my day look like?" and it pulled my calendar, weather and messages into one spoken answer in ~2 seconds. That's when it stopped feeling like a gadget.

**A language model beats scripted commands, by a lot.** Early on I hard-coded intents ("play music", "next"). It was brittle. Switching the brain to an actual LLM meant it could handle "put on something chill" or "am I free after 4?" without me anticipating every phrasing. Huge difference.

**Face recognition is great UX but a privacy minefield.** Having the mirror recognise who's standing there and load their profile is genuinely lovely in a shared home. But I decided early: indicator LED when the camera's on, everything stays on-device, no cloud. I wouldn't put a mirror with a camera in my own bedroom otherwise, so I couldn't ask anyone else to.

**Scope creep is real.** It now does guided workouts (with LED backlight that goes red/blue for work/rest), Spotify with synced karaoke lyrics, WhatsApp notifications, and motion alerts when nobody should be home. Every one of those was "just one more weekend."

Stack, if useful to anyone: Raspberry Pi, Node.js + Express + Socket.io backend, vanilla JS frontend (no framework — it's a kiosk, didn't need one), Porcupine wake word, Claude for the AI, Google APIs for calendar/gmail, Spotify Web API, LRCLIB for lyrics.

Happy to go deep on any part — the voice pipeline, the two-way glass sourcing in India, keeping a Pi stable in kiosk mode, whatever. What would you have built differently?

---

## VERSION B — Medium

**Title:** How I Built an AI Smart Mirror in Pune (Raspberry Pi + Claude)
**Subtitle:** A year of turning a clock-on-glass into a voice assistant that knows my day — the wins, the dead ends, and the stack.

*(Use the same story as Version A, but you can expand each section into a couple of paragraphs, add photos of the build stages, and it's fine to end with a soft line like: "If you want to follow along or join the waitlist, it's at getmira.co.in." Medium tolerates that; Reddit does not.)*

Opening paragraph:

> A year ago I hung a Raspberry Pi behind a sheet of two-way glass in my flat in Pune. It showed the time and the weather, and I thought that was the project. It wasn't. This is the story of how a weekend build became Mira — a mirror you can talk to that runs your morning — and everything that broke along the way.

Then reuse the four lessons from Version A as H2 sections (Voice, LLM vs scripted, Face recognition & privacy, Scope creep), each expanded, and close with the stack + an invitation to follow along.

---

## Where to post

**Reddit (use Version A):**
- r/smarthome — your core audience; frame as a build + discussion
- r/raspberry_pi — lead hard on the technical build; they'll love the stack
- r/india or r/bangalore/r/pune — "built this in Pune" angle plays well locally
- r/DIY or r/somethingimade — the build itself
- r/homeautomation — integrations angle

Post to ONE subreddit at a time, space them out over days/weeks, and read each sub's self-promotion rules first (many require a maker flair or a ratio of non-promo participation). Reply to every comment — that engagement is what makes the thread rank and get cited.

**Medium (use Version B):**
- Publish on your own profile; tag: Smart Home, Raspberry Pi, Artificial Intelligence, IoT, Startup
- Cross-post to Hashnode/Dev.to for the technical audience and extra backlinks

**Why this matters for AI visibility:** genuine Reddit threads and technical blog posts are exactly the sources ChatGPT, Claude, Gemini and Perplexity lean on. This is the single highest-leverage thing you can do right now to get Mira mentioned in AI answers — more than any on-page tweak.
