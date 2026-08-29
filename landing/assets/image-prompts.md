# Mira Landing Page — Image Generation Prompts

Tuned for **Gemini (Nano Banana)** and **GPT-4o image**. Generate in both, keep the better one.
Each prompt maps to an existing asset slot on the landing page.

---

## Master style block (prepend to EVERY prompt)

> A premium AI smart mirror called "Mira" — a tall vertical edge-to-edge glass mirror with a thin matte-black aluminium frame, wall-mounted. The mirror surface is reflective dark glass; UI elements glow through it in white and a single accent color: teal #4af0c4. Pure black (#000000) UI background, NO gradients, NO rounded glassmorphism cards, NO shadows — flat, minimal, monospaced typography (like Space Mono) for numbers and headings, clean sans-serif for body text. Text on screen must be crisp and readable. Photorealistic product photography, soft ambient lighting, shallow depth of field.

**Negative / avoid:** blue sci-fi hologram glow, futuristic HUD clutter, rounded frosted-glass cards, rainbow gradients, Iron-Man-style interfaces, watermark text, distorted letters.

**Dashboard layout reference (for any dashboard shot):** three zones — left column of widgets, empty center (the actual reflection), right column of widgets, and a slim AI voice bar at the bottom center. Widgets are text-only blocks with tiny uppercase teal labels.

---

## 1. Hero — `assets/main.png` (16:9 or 3:2)

[Master style block] Wide hero shot of the Mira smart mirror mounted on a warm minimalist bedroom wall in a modern Indian apartment, morning sunlight from a side window. The mirror shows the full dashboard: left column — large monospaced clock "7:24" with "AM" and below it "Good morning, Arjun", date "Friday, July 18", a weather widget "28° Pune, Haze" with a small 3-day forecast row; right column — "TODAY" schedule list with two calendar entries ("9:30 Standup", "1:00 Lunch with Priya"), a "TASKS" list with small checkboxes, a "HABITS" row with a teal streak counter "12 🔥"; bottom center — a thin teal-glowing voice bar reading "Hey Mira". Center of the mirror reflects the softly blurred room. A subtle warm-white LED glow halos the mirror edges against the wall. No person in frame.

## 2. Morning briefing — `assets/pics/morning.png` (4:5 or 3:4, close-up)

[Master style block] Close-up straight-on shot of the upper-left portion of the Mira mirror screen at dawn. Dominant: huge monospaced clock "6:58 AM" in white, beneath it "Good morning, Arjun" and the date. Below, a weather block: "28°" large, "Haze · Pune", teal mini forecast icons. A faint teal uppercase label "MORNING BRIEFING" with two lines of briefing text: "3 meetings today · 2 tasks due" and "Leave by 9:10 for your first meeting". The rest of the glass fades to black reflection. Macro product-photography feel, slight glass reflection sheen.

## 3. Voice interaction — `assets/pics/voice.png` (4:5)

[Master style block] A man in his late 20s (Indian, casual t-shirt) stands facing the mirror, seen from behind at a slight angle, mid-sentence. On the mirror, the bottom voice bar is active: glowing teal waveform animation and the live transcript "Hey Mira, what's on my calendar today?" in monospaced text. Above it a short AI reply appears: "You have 3 events. First is Standup at 9:30." A calendar widget on the right edge glows with a teal highlight border, as if just activated. Dim evening room, mirror is the main light source, teal glow reflecting faintly on his shoulder.

## 4. WhatsApp on mirror — `assets/pics/whatsapp.png` (4:5)

[Master style block] Close-up of the notifications widget area on the Mira mirror. Teal uppercase label "MESSAGES" with a small counter badge "4". Below, three WhatsApp-style message previews in clean white text on pure black: "Maa — Call me when free", "Rohit — Sending the invoice tonight", "Gym Group — Session moved to 7am". Tiny timestamps in gray. A subtle teal unread dot next to each. The surrounding glass is dark reflective black. No phone in shot — messages live on the mirror itself.

## 5. Face recognition — `assets/cam/photo1.png` (4:5)

[Master style block] A young woman approaches the mirror in a hallway; the mirror greets her. On screen, centered: a thin teal scanning frame outline (minimal, single 1px line — not sci-fi), the text "Welcome back, Ananya" in monospaced type, and her personalized dashboard fading in on the side columns. Her reflection is visible in the center glass. Warm home lighting, evening.

## 6. Motion alert — `assets/cam/photo2.png` (4:5 or 1:1)

[Master style block] The Mira mirror in a dark empty living room at night. On its screen a minimal alert card: teal uppercase label "MOTION DETECTED", timestamp "2:14 AM", and a small monochrome camera snapshot thumbnail of the hallway. A single thin teal border pulses around the alert block. The room is dark; the mirror text is the only light. Tense but clean and minimal — no red alarm clichés.

## 7. Live view on phone — `assets/cam/photo3.png` (4:5)

[Master style block] Two-subject composition: in the background, the Mira mirror on a wall with a small teal "LIVE" dot on screen; in the sharp foreground, a hand holding a phone showing the Mira companion app — dark UI, teal accents, a live camera stream of that same room, buttons "Talk" and "Snapshot". Conveys: watch your home from anywhere. Moody, secure, minimal.

## 8. Fitness mode — `assets/fitness/1.png` (16:9) and `assets/fitness/2.png` (4:5 close-up)

[Master style block] The Mira mirror in workout mode with the LED strip behind it glowing deep red. A fit man mid-squat in front of the mirror, athletic wear, small home-gym corner with a mat and dumbbells. On screen: exercise name "SQUATS" in large monospaced type, a big rep counter "08 / 12", set indicator "SET 2 OF 3", a thin teal progress bar, and a small timer "00:42". His reflection is visible behind the UI. Red backlight rim glow on the wall contrasts with the teal UI.
*(For 2.png: same scene, tight close-up on the screen showing the rest-timer state — "REST 00:30", "NEXT: LUNGES", calories "112 kcal" — with the red LED glow bleeding into frame.)*

## 9. Karaoke mode — `assets/karaoke-mode.png` (16:9)

[Master style block] The Mira mirror in karaoke mode at night, LED strip cycling party colors (magenta/purple rim glow on the wall). On screen: large centered lyrics, current line in glowing teal "Tum hi ho... 🎵" with previous/next lines dimmed gray above and below; along the bottom, a minimal audio beat-visualizer of thin vertical teal bars, taller in the center. Album art thumbnail and track title "Tum Hi Ho — Arijit Singh" small in a corner. A woman singing with a hairbrush as a mic, laughing, slightly blurred — the mirror UI is the sharp focus.

---

## Generator notes

- **Gemini / Nano Banana:** paste prompts as-is; it renders on-screen text well. If text garbles, add: "Render all on-screen text exactly as written, sharp and legible."
- **GPT-4o:** same prompts work; it follows layout instructions well but may soften the "no gradients" rule — re-assert "flat pure-black UI, no gradients" if needed.
- Keep on-screen text SHORT — fewer words = fewer glitches. Regenerate only the failed region if the tool supports editing (Nano Banana does).
- For consistency across the set, generate #1 first, then use it as a reference image ("match the mirror frame, UI style, and colors of this image") for the rest — both tools support image references.
