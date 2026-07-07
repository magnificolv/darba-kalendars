# Darba Kalendārs v3.0 — Vilciena Konduktora Grafika Pārvaldnieks

> Pārņemts no Claude Code, pārbūvēts ar Hermes Agent  
> 2026. gada 7. jūlijs

## 📖 Kas tas ir?

Pašpietiekama HTML lietotne vilciena konduktora darba grafika pārvaldībai.  
Atver `index.html` jebkurā pārlūkā — nav nepieciešams serveris, nav jāinstalē nekas.

## 🔄 Darba Plūsma

### 1. Iegūsti grafika tekstu
Ir divi ceļi:

**A) 🤖 Hermes Auto (ieteicams Magnifico)**
- Noklikšķini "Kopēt Hermes Promptu"
- Ielīmē to Hermes čatā + pievieno grafika bildi
- Hermes atgriezīs strukturētu tekstu
- Ielīmē to atpakaļ lietotnē

**B) 📋 Gemini (universāls — vari dot kolēģiem)**
- Iekopē Gemini promptu (redzams lietotnē)
- Iedod to Gemini kopā ar bildi
- Ielīmē Gemini atbildi lietotnē

### 2. Pārbaudi un rediģē
- Pārskati visas dienas, izlabo ja nepieciešams
- Klikšķini uz tūres lai rediģētu
- Izmanto 🌙 pogu lai atzīmētu nakts maiņas
- Pievieno tūru PDF katalogus (tos, kur ir laiki)

### 3. Izveido kalendāru
- Nospied "Veidot kalendāru"
- pdf.js automātiski izlasīs tūru laikus no PDF
- Kalendārs parādīs visas dienas ar laikiem

### 4. Skaties un analizē
- Mēneša pārskats ar krāsu kodējumu
- Statistika: darba dienas, brīvdienas, kopējās stundas
- Klikšķini uz dienas lai redzētu detaļas
- Kalendārs saglabājas automātiski (LocalStorage)

## 🎨 Krāsu Kodējums

| Krāsa | Apraksts |
|-------|----------|
| 🔵 Zils | Parasta darba diena |
| 🟣 Violets | Nakts maiņa (šķērso pusnakti) |
| 🟢 Zaļš | Nakts maiņa (sākās iepriekšējā dienā) |
| ⚫ Pelēks | Brīvdiena |
| 🟠 Oranžs | Tūre nav atrasta PDF katalogā |

## 📁 Failu Struktūra

```
darba-kalendars/
├── index.html        ← Galvenā lietotne (viss vienā failā)
├── README.md         ← Šis fails
└── archive/          ← Vecās versijas (no Claude Code laikmeta)
    ├── grafiks.html          (v1 prototips)
    ├── grafiks2.html         (v2 — latviešu mēneši)
    ├── grafiks3.html         (v3 — vairāki datumi)
    ├── darba_kalendars.jsx   (React SPA)
    ├── darba_kalendars_1.jsx (identisks)
    ├── darba_kalendars (1).jsx (variācija)
    └── vilciena_kalendars.jsx (v2.1 — pēdējā React versija)
```

## 🔧 Tehniskā Informācija

- **Tech stack**: HTML + CSS + vanilla JavaScript + pdf.js
- **PDF apstrāde**: Klienta pusē ar pdf.js (nav nepieciešams API)
- **Datu glabāšana**: LocalStorage (pārlūkā)
- **Atkarības**: Tikai Google Fonts un pdf.js CDN (darbojas arī bezsaistē pēc pirmās ielādes)

## 📝 Versiju Vēsture

| Versija | Datums | Izmaiņas |
|---------|--------|----------|
| v1-v3 | 2025 | html prototipi ar pdf.js |
| v2.1 | 2026.03.03 | React SPA ar Claude API |
| **v3.0** | **2026.07.07** | **Pārņemts ar Hermes. Self-contained HTML. pdf.js aizvieto Claude. Hermes integrācija.** |

## 🚀 Kā Palait?

Vienkārši atver `index.html` pārlūkā. Viss.

Lai dotu kolēģim — vienkārši iedod `index.html` failu.  
Nevajag instalēt, nevajag serveri, nevajag API atslēgas.

---

> Būvēts ar ❤️ izmantojot Hermes Agent
