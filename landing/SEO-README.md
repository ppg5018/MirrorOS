# Mira Landing Page — SEO Deploy Guide

Deploy-ready files for **getmira.co.in**, optimized to rank for the **Mira / AI smart mirror** niche.

## Files

| File | Where it goes | Purpose |
|---|---|---|
| `index.html` | site root (replaces current) | Full page, optimized meta tags, semantic HTML, JSON-LD |
| `robots.txt` | site root | Allows all crawlers + AI bots, points to sitemap |
| `sitemap.xml` | site root | Tells Google your one page + images |

## ⚠️ Copy your images in before deploying

The page now uses **portable relative image paths** (`/assets/...`) instead of hard-coded `getmira.co.in` URLs — better for SEO and for preview deploys. This means your images must ship **inside** the deploy. Empty `assets/`, `assets/pics/`, `assets/cam/`, `assets/fitness/` folders are already scaffolded in `landing/` — just drop your existing PNGs into them so the final structure is:

```
landing/assets/main.png
landing/assets/karaoke-mode.png
landing/assets/pics/morning.png, voice.png, whatsapp.png
landing/assets/cam/photo1.png, photo2.png, photo3.png
landing/assets/fitness/1.png
```

(The social-share and structured-data image URLs remain absolute `https://www.getmira.co.in/...` on purpose — that's what Facebook/Twitter/Google require.)

## Before you go live (2 quick edits)

1. **Waitlist form** — `index.html` currently just shows a success message on submit. Point it at your real backend (Google Form, Formspree, or your API): edit the `<form action="...">` and the `<script>` at the bottom.
2. **Favicon** — add `/favicon.ico` and `/assets/apple-touch-icon.png` at the site root (referenced in `<head>`). Small win, but shows in search results and browser tabs.

## What was optimized (on-page)

- **Title** (54 chars) and **meta description** (~156 chars) built around "AI smart mirror" + "voice-controlled smart mirror".
- **One `<h1>`** ("Your mirror. Reimagined.") + clean H2/H3 hierarchy — search engines read the outline correctly.
- **All 8 images have descriptive alt text** containing "smart mirror" / "Mira".
- **Open Graph + Twitter cards** — good-looking previews when shared on WhatsApp, X, LinkedIn.
- **Canonical tag** set to the `www` version (your site redirects non-www → www, so this is correct).
- **JSON-LD structured data**: Organization, WebSite, Product, **FAQPage**, BreadcrumbList. The FAQ can earn expandable rich results in Google. No fake reviews/ratings were added (Google penalizes those).
- **Semantic HTML5** (`<main>`, `<section>`, `<figure>`), lazy-loaded images, `fetchpriority` on the hero — helps Core Web Vitals.

## After you deploy — do these (this is what actually moves rankings)

On-page SEO alone rarely gets you ranking. The needle-movers:

1. **Google Search Console** (free) — verify getmira.co.in, submit `sitemap.xml`, request indexing. https://search.google.com/search-console — do this first.
2. **Bing Webmaster Tools** — same, also feeds ChatGPT/Copilot search.
3. **Google Business Profile** — list "Mira" as a Pune business; strong for "smart mirror India/Pune" searches.
4. **Backlinks** — get mentioned on: Product Hunt, Indian tech blogs, YourStory, Reddit (r/smarthome), local Pune startup press. Each quality link raises authority. This is the #1 factor for competitive terms.
5. **Content** — add a short **/blog** with articles like "What is an AI smart mirror?" and "Smart mirror vs regular mirror". Ranking for the bare term "smart mirror" needs supporting content pages, not just one landing page.
6. **Consistency** — same brand name, description and logo across every listing (helps Google's Knowledge Panel).

## Reality check on "smart mirror"

Ranking #1 globally for the generic word **"smart mirror"** competes with Amazon and established brands — slow and not guaranteed. This build targets the **winnable, high-intent** terms first: *Mira smart mirror, AI smart mirror, voice smart mirror, smart mirror India/Pune*. As you earn backlinks and add blog content, you climb toward the broader term over time.
