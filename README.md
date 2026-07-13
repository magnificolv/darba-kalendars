# Darba Kalendārs v3.5 — Vilciena Konduktora Grafika Pārvaldnieks

> Pārņemts no Claude Code, pārbūvēts un hārdenēts ar Hermes Agent  
> Atjaunināts: 2026-07-13 (v3.5 security + math + data-safety)

## Kas tas ir?

Pašpietiekama HTML lietotne vilciena konduktora darba grafika pārvaldībai.  
Atver `index.html` vai https://magnificolv.github.io/darba-kalendars/

## Ievades ceļi

### 1) Universālais (visiem) — Gemini / jebkurš LLM copy-paste
1. Nokopē Gemini promptu no app
2. Iedod grafika bildi Gemini (vai citam modelim)
3. Ielīmē tabulu appā → Tālāk

### 2) Hermes prompt
1. "Kopēt Hermes Promptu"
2. Ielīmē Hermes čatā + bilde
3. Atpakaļ appā copy/paste

### 3) Auto OCR (advanced)
- **Noklusējums: OFF**
- Magnifico: Worker režīms ar privāto **Worker atslēgu** (X-App-Key)
- Citi advancēti: **BYOK** — sava OpenRouter / OpenAI-compatible vision atslēga  
  Worker tad *proxy* lieto **tavu** atslēgu, ne Magnifico Nous kontu.
- Rate limit: ~20 bildes/stundā no IP

> Bez atslēgas Auto OCR poga ir bloķēta. Nav atvērta publiska "ēd Magnifico kredītus" cauruma.

## Galvenās v3.5 izmaiņas
- `Dzēst mēnesi` dzēš **tikai** aktīvo mēnesi (vairs ne visu localStorage)
- Full reset = divi apstiprinājumi
- `escapeHtml` pret XSS
- Nakts stundas ar **minūšu precizitāti** (ne 30 min lēcieniem)
- Dežūras D=16h, D10=10h default
- Overnight pāris: stundas netiek dubultskatītas; UI rāda "stundas → iepr. dienā"
- LV svētku **pārcelšana** (4.maijs / 18.nov → pirmdiena, ja Sest./Sv.)
- Leģenda (ne fake filtri)
- CSS klases šūnām (vieglāks mobile)
- Worker: APP_KEY, CORS allowlist, IP rate limit, BYOK

## Krāsu kodējums

| Krāsa | Nozīme |
|-------|--------|
| Zils | Darbs |
| Violets | Nakts (šķērso pusnakti) |
| Zaļš | Nakts (sākās iepr. dienā) |
| Tumšs | Brīvdiena |
| Oranžs | Tūre nav PDF |

## Tech
- HTML + CSS + vanilla JS + pdf.js
- LocalStorage multi-month (`darba-kalendars-v3`)
- OCR settings localStorage atsevišķi (`darba-kalendars-ocr-v1`)
- Cloudflare Worker: `darba-grafiks-worker.magnificox.workers.dev`

## Backup
Pirms v3.5: `~/projects/darba-kalendars-backups/20260713_093504/` un `.tar.gz`

---
Būvēts ar ❤️ + Hermes Agent
