import { useState, useRef, useCallback, useEffect } from "react";

const API_URL = "https://api.anthropic.com/v1/messages";
const MONTH_LV = ["","Janvāris","Februāris","Marts","Aprīlis","Maijs","Jūnijs",
  "Jūlijs","Augusts","Septembris","Oktobris","Novembris","Decembris"];
const DAY_LV = ["Pr","Ot","Tr","Ce","Pk","Se","Sv"];
const DOW_LV = ["","PIRMDIENA","OTRDIENA","TREŠDIENA","CETURTDIENA","PIEKTDIENA","SESTDIENA","SVĒTDIENA"];

// ── helpers ──────────────────────────────────────────────────────────────────

async function callClaude(messages, maxTokens = 10000) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-opus-4-6", max_tokens: maxTokens, messages }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content.map(b => b.text || "").filter(Boolean).join("");
}

function toBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function matchesDow(pattern, dow) {
  if (!pattern || pattern === "1-7d") return true;
  const p = pattern.replace(/d$/i, "");
  for (const part of p.split(",")) {
    if (part.includes("-")) {
      const [a, b] = part.split("-").map(Number);
      if (dow >= a && dow <= b) return true;
    } else if (parseInt(part) === dow) return true;
  }
  return false;
}

function getBestVariant(variants, dow) {
  if (!variants || variants.length === 0) return null;
  return variants.find(v => matchesDow(v.dayPattern, dow)) || variants[0];
}

function isOvernight(start, end) {
  if (!start || !end || start === "?" || end === "?") return false;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh * 60 + em) < (sh * 60 + sm);
}

function calcHours(start, end) {
  if (!start || !end || start === "?" || end === "?") return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let m = (eh * 60 + em) - (sh * 60 + sm);
  if (m < 0) m += 1440;
  return (m / 60).toFixed(1);
}

// "70157" → "701/57" (5-digit image format → PDF slash format)
function normalizeTour(raw) {
  if (!raw) return raw;
  const s = String(raw).trim();
  if (!s || s.toLowerCase() === "b" || s === "-") return s;
  if (s.includes("/")) return s;
  if (/^7\d{4}$/.test(s)) return s.slice(0, 3) + "/" + s.slice(3);
  return s;
}

function lookupTour(tours, id) {
  if (!tours || !id) return null;
  if (tours[id]) return tours[id];
  const n = normalizeTour(id);
  if (n !== id && tours[n]) return tours[n];
  const ns = id.replace("/", "");
  if (ns !== id && tours[ns]) return tours[ns];
  return null;
}

// Parse the Gemini text table into { day: { tour, prevNight } }
// Accepts many formats:
//   "1: /70174"  "1. b"  "1 - 7117"  "| 1 | /70174 |"  "Day 1: 70174 (/)"
function parseGeminiText(text) {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const result = {};
  let detectedMonth = null;
  let detectedYear = null;

  // Try to detect month/year from header lines
  for (const line of lines.slice(0, 6)) {
    const m = line.match(/(\d{4})/);
    if (m) detectedYear = parseInt(m[1]);
    for (let i = 1; i <= 12; i++) {
      if (line.toLowerCase().includes(MONTH_LV[i].toLowerCase())) {
        detectedMonth = i;
        break;
      }
    }
    // English month names
    const eng = ["","january","february","march","april","may","june","july","august","september","october","november","december"];
    for (let i = 1; i <= 12; i++) {
      if (line.toLowerCase().includes(eng[i])) { detectedMonth = i; break; }
    }
  }

  for (const line of lines) {
    // Skip pure header/separator lines
    if (/^[-|=\s]+$/.test(line)) continue;

    // Match patterns like:  "1: /70174"  "1. b"  "1 - 7117"  "| 1 | 70174 |"  "**1**"
    // First capture the day number
    const dayMatch = line.match(/(?:^|\||\s)(\d{1,2})(?:\s*[:.\-|]|\s+)/);
    if (!dayMatch) continue;
    const day = parseInt(dayMatch[1]);
    if (day < 1 || day > 31) continue;

    // Get everything after the day number
    const rest = line.slice(line.indexOf(dayMatch[0]) + dayMatch[0].length).trim()
      .replace(/\|/g, " ").replace(/\*\*/g, "").trim();

    if (!rest) continue;

    // Check for overnight slash prefix: "/70174" or "/ 70174"
    const prevNight = /^\/\s*\d/.test(rest) || rest.includes("(/)")  || /перенос|overnight|prev/i.test(rest);

    // Extract tour number (4-5 digits starting with 7) or "b"
    const tourMatch = rest.match(/\b(7\d{3,4})\b/);
    const isOff = /^\s*b\s*$/i.test(rest.replace(/[/\s]/g, "")) || /\bbrīv/i.test(rest) || /\bfree\b/i.test(rest) || /\boff\b/i.test(rest);

    if (isOff) {
      result[day] = { tour: "b", prevNight: false };
    } else if (tourMatch) {
      result[day] = { tour: normalizeTour(tourMatch[1]), prevNight };
    }
  }

  return { schedule: result, month: detectedMonth, year: detectedYear };
}

// ── Component ─────────────────────────────────────────────────────────────────

const STEPS = { PASTE: "paste", EDIT: "edit", LOADING: "loading", CALENDAR: "calendar" };

export default function App() {
  const [step, setStep] = useState(STEPS.PASTE);
  const [geminiText, setGeminiText] = useState("");
  const [parsed, setParsed] = useState(null); // { schedule, month, year }
  const [editSchedule, setEditSchedule] = useState({}); // { day: { tour, prevNight } }
  const [metaMonth, setMetaMonth] = useState("");
  const [metaYear, setMetaYear] = useState(new Date().getFullYear());
  const [pdfs, setPdfs] = useState([]);
  const [loadStep, setLoadStep] = useState("");
  const [loadPct, setLoadPct] = useState(0);
  const [calData, setCalData] = useState(null);
  const [error, setError] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [editingDay, setEditingDay] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [showDebug, setShowDebug] = useState(false);
  const pdfInputRef = useRef();

  // Parse gemini text when it changes
  useEffect(() => {
    if (!geminiText.trim()) { setParsed(null); return; }
    const p = parseGeminiText(geminiText);
    if (Object.keys(p.schedule).length > 0) {
      setParsed(p);
      setEditSchedule(JSON.parse(JSON.stringify(p.schedule)));
      if (p.month) setMetaMonth(String(p.month));
      if (p.year) setMetaYear(p.year);
    } else {
      setParsed(null);
    }
  }, [geminiText]);

  const onPdfDrop = useCallback((e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files || e.target.files).filter(f => f.type === "application/pdf");
    setPdfs(prev => {
      const names = new Set(prev.map(p => p.name));
      return [...prev, ...files.filter(f => !names.has(f.name))];
    });
  }, []);

  const removePdf = (i) => setPdfs(prev => prev.filter((_, idx) => idx !== i));

  const daysInMonth = () => {
    const m = parseInt(metaMonth);
    if (!m || !metaYear) return 31;
    return new Date(metaYear, m, 0).getDate();
  };

  const getDow = (d) => {
    const m = parseInt(metaMonth);
    if (!m || !metaYear) return 1;
    const w = new Date(metaYear, m - 1, d).getDay();
    return w === 0 ? 7 : w;
  };

  const saveEdit = (day) => {
    const raw = editVal.trim();
    if (!raw) return;
    const prevNight = raw.startsWith("/");
    const cleaned = raw.replace(/^\/\s*/, "").trim();
    const isOff = cleaned.toLowerCase() === "b" || cleaned === "";
    const tour = isOff ? "b" : normalizeTour(cleaned);
    setEditSchedule(prev => ({ ...prev, [day]: { tour, prevNight } }));
    setEditingDay(null);
  };

  const buildCalendar = async () => {
    if (!metaMonth || !metaYear) { setError("Norādi mēnesi un gadu!"); return; }
    if (pdfs.length === 0) { setError("Pievienojiet vismaz vienu tūru PDF!"); return; }

    setStep(STEPS.LOADING); setError(null); setLoadPct(0);

    try {
      setLoadStep("📄 Nolasa tūru laikus no PDF failiem..."); setLoadPct(20);

      const pdfMsgs = [];
      for (const f of pdfs) {
        const b64 = await toBase64(f);
        pdfMsgs.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } });
      }

      const dim = daysInMonth();
      const needed = new Set();
      for (let d = 1; d <= dim; d++) {
        const e = editSchedule[d];
        if (e?.tour && e.tour !== "b") needed.add(e.tour);
      }

      const dowRef = [];
      for (let d = 1; d <= dim; d++) dowRef.push(`${d}=${getDow(d)}`);

      pdfMsgs.push({
        type: "text",
        text: `These are Latvian train conductor work tour PDFs (tūres).

Each tour has:
- "Tūres Nr." = tour number like "701/57", "702/56", "703/59", "7014", "7117"
- "Darba sākums" = work start time
- "Darba beigas" = work end time
- Day pattern like "1-7d"=all, "1-5d"=Mon-Fri, "6d"=Sat, "7d"=Sun, "6,7d"=Sat+Sun etc.
  (1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 7=Sun)

Extract ALL tours from ALL documents. Do not skip any tour.
If a tour has multiple day variants, include each as a separate array entry.

Return ONLY valid JSON:
{
  "tours": {
    "701/47": [{"dayPattern":"1-7d","startTime":"22:07","endTime":"08:26","hours":10.32}],
    "702/56": [{"dayPattern":"1-7d","startTime":"05:12","endTime":"13:24","hours":8.2}],
    "701/57": [
      {"dayPattern":"1-4,7d","startTime":"09:58","endTime":"20:29","hours":10.52},
      {"dayPattern":"5,6d","startTime":"09:58","endTime":"20:18","hours":10.33}
    ],
    "7014": [{"dayPattern":"1-6d","startTime":"16:18","endTime":"00:18","hours":8.0}]
  }
}`
      });

      setLoadPct(50);
      const raw = await callClaude([{ role: "user", content: pdfMsgs }], 8000);
      setLoadPct(80);

      let toursJson;
      try {
        const cleaned = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        // Find JSON object boundaries in case there's extra text
        const jsonStart = cleaned.indexOf('{');
        const jsonEnd = cleaned.lastIndexOf('}');
        if (jsonStart === -1 || jsonEnd === -1) throw new Error("Nav JSON objekta atbildē");
        toursJson = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
      } catch (parseErr) {
        throw new Error("Neizdevās nolasīt PDF failus: " + parseErr.message + ". Atbilde sākās ar: " + raw.slice(0, 120));
      }

      setLoadStep("📅 Veido kalendāru..."); setLoadPct(90);

      const calendar = {};
      for (let d = 1; d <= dim; d++) {
        const e = editSchedule[d];
        if (!e || !e.tour || e.tour === "b") { calendar[d] = { type: "off" }; continue; }
        const dow = getDow(d);
        const variants = lookupTour(toursJson.tours, e.tour);
        const v = getBestVariant(variants, dow);
        const prevNight = e.prevNight === true;
        const nightShift = !prevNight && v ? isOvernight(v.startTime, v.endTime) : false;
        calendar[d] = {
          type: "work",
          tour: e.tour,
          startTime: v?.startTime || "?",
          endTime: v?.endTime || "?",
          overnight: nightShift,
          prevDayOvernight: prevNight,
          hours: v?.hours || (v ? calcHours(v.startTime, v.endTime) : null),
          notFound: !variants,
        };
      }

      setLoadPct(100);
      setCalData({ month: parseInt(metaMonth), year: metaYear, daysInMonth: dim, calendar, pdfTours: toursJson.tours });
      setStep(STEPS.CALENDAR);

    } catch (e) {
      setError(e.message);
      setStep(STEPS.EDIT);
    } finally {
      setLoadStep(""); setLoadPct(0);
    }
  };

  const reset = () => {
    setStep(STEPS.PASTE); setGeminiText(""); setParsed(null); setEditSchedule({});
    setCalData(null); setError(null); setSelectedDay(null); setPdfs([]);
    setMetaMonth(""); setMetaYear(new Date().getFullYear());
  };

  // ── stats ──
  const totalWork = calData ? Object.values(calData.calendar).filter(d => d.type === "work").length : 0;
  const totalOff = calData ? Object.values(calData.calendar).filter(d => d.type === "off").length : 0;
  const totalHrs = calData ? Object.values(calData.calendar).filter(d => d.type === "work" && d.hours).reduce((s, d) => s + parseFloat(d.hours), 0).toFixed(1) : 0;
  const notFound = calData ? Object.values(calData.calendar).filter(d => d.notFound).length : 0;
  const firstDow = calData ? (() => { const w = new Date(calData.year, calData.month - 1, 1).getDay(); return w === 0 ? 7 : w; })() : 1;
  const selDay = selectedDay && calData ? calData.calendar[selectedDay] : null;

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "#0c0e14", color: "#e8eaf0", fontFamily: "'DM Mono','Courier New',monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Bebas+Neue&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:#161820}::-webkit-scrollbar-thumb{background:#f59e0b;border-radius:3px}
        .btn{background:#f59e0b;color:#0c0e14;border:none;padding:12px 28px;font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:2px;cursor:pointer;border-radius:6px;transition:all .2s}
        .btn:hover{background:#fbbf24;transform:translateY(-1px);box-shadow:0 4px 20px rgba(245,158,11,.4)}
        .btn:disabled{background:#2a2d3a;color:#4a4d5a;cursor:not-allowed;transform:none;box-shadow:none}
        .btn-sm{background:#1c2035;color:#93c5fd;border:1px solid #2a3a5c;padding:6px 14px;font-family:'DM Mono',monospace;font-size:11px;cursor:pointer;border-radius:4px;transition:all .2s}
        .btn-sm:hover{background:#2a3a5c;color:#bfdbfe}
        .btn-ghost{background:transparent;color:#9ca3af;border:1px solid #2a2d3a;padding:8px 16px;font-family:'DM Mono',monospace;font-size:11px;cursor:pointer;border-radius:4px;transition:all .2s}
        .btn-ghost:hover{border-color:#f59e0b;color:#f59e0b}
        .btn-red{background:transparent;color:#f87171;border:1px solid #3a2020;padding:6px 14px;font-size:11px;cursor:pointer;border-radius:4px;transition:all .2s}
        .btn-red:hover{background:#2a1515;border-color:#f87171}
        textarea{background:#0f1117;border:1px solid #2a2d3a;color:#e8eaf0;padding:14px;border-radius:8px;font-family:'DM Mono',monospace;font-size:12px;resize:vertical;width:100%;outline:none;transition:border .2s;line-height:1.6}
        textarea:focus{border-color:#f59e0b}
        input[type=text],input[type=number]{background:#0f1117;border:1px solid #2a2d3a;color:#e8eaf0;padding:8px 12px;border-radius:6px;font-family:'DM Mono',monospace;font-size:12px;outline:none;transition:border .2s}
        input[type=text]:focus,input[type=number]:focus{border-color:#f59e0b}
        select{background:#0f1117;border:1px solid #2a2d3a;color:#e8eaf0;padding:8px 12px;border-radius:6px;font-family:'DM Mono',monospace;font-size:12px;outline:none;cursor:pointer}
        .dz{border:2px dashed #2a2d3a;border-radius:10px;padding:20px;text-align:center;cursor:pointer;transition:all .2s;background:#161820}
        .dz:hover{border-color:#f59e0b;background:#1c1f2b}
        .dc{border-radius:8px;padding:9px 7px;min-height:86px;cursor:pointer;transition:all .15s;position:relative;border:1px solid transparent;user-select:none}
        .dc:hover{transform:scale(1.05);z-index:10}
        .dw{background:#1a2035;border-color:#2a3a5c}.dw:hover{border-color:#3b82f6;box-shadow:0 0 14px rgba(59,130,246,.3)}
        .dn{background:#1f1535;border-color:#3b2a5c}.dn:hover{border-color:#8b5cf6;box-shadow:0 0 14px rgba(139,92,246,.3)}
        .dp{background:#1f2a20;border-color:#2a5c35}.dp:hover{border-color:#22c55e;box-shadow:0 0 14px rgba(34,197,94,.3)}
        .do{background:#111318;border-color:#1a1d26}.do:hover{border-color:#2a2d3a}
        .dnf{background:#2a1a10;border-color:#5c3a1a}
        .sel.dw{border-color:#3b82f6!important;box-shadow:0 0 20px rgba(59,130,246,.5)!important}
        .sel.dn{border-color:#8b5cf6!important;box-shadow:0 0 20px rgba(139,92,246,.5)!important}
        .sel.dp{border-color:#22c55e!important;box-shadow:0 0 20px rgba(34,197,94,.5)!important}
        .pb{height:3px;background:#1c1f2b;border-radius:2px;overflow:hidden}
        .pf{height:100%;background:linear-gradient(90deg,#f59e0b,#ef4444);border-radius:2px;transition:width .4s}
        .sc{background:#161820;border:1px solid #2a2d3a;border-radius:10px;padding:14px 18px}
        .tg{display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;letter-spacing:1px}
        .erow{display:grid;grid-template-columns:28px 1fr 80px auto;gap:6px;align-items:center;padding:5px 8px;border-radius:6px;transition:background .15s}
        .erow:hover{background:#161820}
        .erow.wknd{background:#15130a}
        .erow.wknd:hover{background:#1c180a}
        @keyframes pulse{0%,80%,100%{opacity:.2;transform:scale(.9)}40%{opacity:1;transform:scale(1)}}
        .tag-b{background:#111318;color:#4a4d5a;border:1px solid #1a1d26}
        .tag-w{background:#1a2035;color:#93c5fd;border:1px solid #2a3a5c}
        .tag-n{background:#1f1535;color:#a78bfa;border:1px solid #3b2a5c}
        .tag-p{background:#1f2a20;color:#4ade80;border:1px solid #2a5c35}
        .edit-inp{background:#0f1117;border:1px solid #f59e0b;color:#e8eaf0;padding:4px 8px;border-radius:4px;font-family:'DM Mono',monospace;font-size:12px;outline:none;width:100%}
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #1c1f2b", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {[1, .65, .35].map((o, i) => <div key={i} style={{ width: 26, height: 3, background: "#f59e0b", borderRadius: 2, opacity: o }} />)}
          </div>
          <div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: 4, color: "#f59e0b" }}>DARBA KALENDĀRS</div>
            <div style={{ fontSize: 9, color: "#4a4d5a", letterSpacing: 2 }}>VILCIENA KONDUKTORS · GRAFIKA PĀRVALDNIEKS</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {step === STEPS.CALENDAR && <button className="btn-ghost" onClick={() => setStep(STEPS.EDIT)}>✏ REDIĢĒT</button>}
          {step !== STEPS.PASTE && <button className="btn-ghost" onClick={reset}>← SĀKUMS</button>}
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 16px" }}>

        {/* ══ STEP 1: PASTE ══════════════════════════════════════════════════ */}
        {step === STEPS.PASTE && (
          <div>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 40, letterSpacing: 5, lineHeight: 1 }}>
                IELĪMĒ GRAFIKU<br /><span style={{ color: "#f59e0b" }}>NO GEMINI</span>
              </div>
              <div style={{ fontSize: 11, color: "#4a4d5a", marginTop: 10, letterSpacing: 1 }}>PAPRASI GEMINI PĀRVĒRST BILDI TEKSTĀ, TIEM IELĪMĒ ŠEIT</div>
            </div>

            {/* Gemini prompt helper */}
            <div style={{ background: "#161820", border: "1px solid #2a2d3a", borderRadius: 10, padding: "14px 18px", marginBottom: 20 }}>
              <div style={{ fontSize: 10, color: "#f59e0b", letterSpacing: 2, marginBottom: 8 }}>📋 GEMINI PROMPT (nokopē un izmanto)</div>
              <div style={{ background: "#0f1117", borderRadius: 6, padding: "10px 14px", fontSize: 11, color: "#9ca3af", lineHeight: 1.7, fontFamily: "monospace" }}>
                Lūdzu nolasi šo darba grafika bildi un izvadi tabulu šādā formātā:<br />
                1: /70174<br />
                2: b<br />
                3: 7117<br />
                ...<br />
                Kur "/" pirms numura nozīmē naktsmainis (darbs sākās iepriekšējā dienā), "b" = brīvdiena. Tūres numuri ir 4-5 ciparu skaitļi kas sākas ar 7. Neraksti neko citu, tikai šo tabulu.
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "#f59e0b", letterSpacing: 2, marginBottom: 8 }}>IELĪMĒ GEMINI ATBILDI:</div>
              <textarea
                rows={14}
                placeholder={"1: /70174\n2: b\n3: 7117\n4: 7628\n5: 70349\n6: b\n7: 70259\n..."}
                value={geminiText}
                onChange={e => setGeminiText(e.target.value)}
              />
            </div>

            {parsed && Object.keys(parsed.schedule).length > 0 && (
              <div style={{ background: "#1a2a1a", border: "1px solid #2a5c35", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 11, color: "#4ade80" }}>
                ✓ Atpazītas {Object.keys(parsed.schedule).length} dienas
                {parsed.month && <span> · {MONTH_LV[parsed.month]}</span>}
                {parsed.year && <span> {parsed.year}</span>}
              </div>
            )}

            {error && <div style={{ background: "#2a1515", border: "1px solid #ef4444", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 11, color: "#ef4444" }}>⚠ {error}</div>}

            <div style={{ textAlign: "center" }}>
              <button className="btn"
                disabled={!parsed || Object.keys(parsed.schedule).length === 0}
                onClick={() => { setError(null); setStep(STEPS.EDIT); }}
                style={{ minWidth: 260 }}>
                TĀLĀK → PĀRBAUDĪT UN REDIĢĒT
              </button>
            </div>
          </div>
        )}

        {/* ══ STEP 2: EDIT ═══════════════════════════════════════════════════ */}
        {step === STEPS.EDIT && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, letterSpacing: 4 }}>PĀRBAUDI UN REDIĢĒ</div>
                <div style={{ fontSize: 11, color: "#4a4d5a", letterSpacing: 1 }}>KLIKŠĶINI UZ TŪRES LAI LABOTU · PIEVIENO PDF FAILUS</div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "#6b7280" }}>Mēnesis:</span>
                  <select value={metaMonth} onChange={e => setMetaMonth(e.target.value)}>
                    <option value="">—</option>
                    {MONTH_LV.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "#6b7280" }}>Gads:</span>
                  <input type="number" value={metaYear} onChange={e => setMetaYear(parseInt(e.target.value))} style={{ width: 80 }} />
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
              {/* Schedule table */}
              <div style={{ background: "#161820", border: "1px solid #2a2d3a", borderRadius: 10, padding: "14px" }}>
                <div style={{ fontSize: 10, color: "#f59e0b", letterSpacing: 2, marginBottom: 12 }}>GRAFIKS — KLIKŠĶINI LAI LABOTU</div>
                <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 80px auto", gap: 6, marginBottom: 8, padding: "0 8px" }}>
                  {["D","TŪRE","",""].map((h,i) => <div key={i} style={{ fontSize: 9, color: "#4a4d5a", letterSpacing: 1 }}>{h}</div>)}
                </div>
                <div style={{ maxHeight: 460, overflowY: "auto" }}>
                  {Array.from({ length: daysInMonth() }).map((_, i) => {
                    const d = i + 1;
                    const e = editSchedule[d] || { tour: "b", prevNight: false };
                    const dow = getDow(d);
                    const isWE = dow === 6 || dow === 7;
                    const isEditing = editingDay === d;
                    const isOff = !e.tour || e.tour === "b";

                    return (
                      <div key={d} className={`erow ${isWE ? "wknd" : ""}`}>
                        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, color: isWE ? "#f59e0b" : "#6b7280", textAlign: "center" }}>{d}</div>

                        {isEditing ? (
                          <input
                            autoFocus
                            className="edit-inp"
                            value={editVal}
                            onChange={ev => setEditVal(ev.target.value)}
                            onKeyDown={ev => { if (ev.key === "Enter") saveEdit(d); if (ev.key === "Escape") setEditingDay(null); }}
                            placeholder="/70174 vai b"
                          />
                        ) : (
                          <div
                            onClick={() => { setEditingDay(d); setEditVal(e.prevNight ? "/" + e.tour : e.tour); }}
                            style={{ cursor: "pointer", fontSize: 11, color: isOff ? "#3a3d4a" : "#93c5fd", padding: "2px 0" }}
                          >
                            {e.prevNight && <span style={{ color: "#4ade80", marginRight: 4 }}>↩/</span>}
                            {e.tour || "b"}
                          </div>
                        )}

                        <div style={{ fontSize: 9 }}>
                          {isOff ? (
                            <span className="tg tag-b">BRĪVS</span>
                          ) : e.prevNight ? (
                            <span className="tg tag-p">↩ NAKTS</span>
                          ) : (
                            <span className="tg tag-w">DARBS</span>
                          )}
                        </div>

                        <div style={{ display: "flex", gap: 4 }}>
                          {isEditing ? (
                            <>
                              <button className="btn-sm" style={{ fontSize: 10, padding: "3px 8px" }} onClick={() => saveEdit(d)}>✓</button>
                              <button className="btn-red" style={{ padding: "3px 8px" }} onClick={() => setEditingDay(null)}>✗</button>
                            </>
                          ) : (
                            <button className="btn-sm" style={{ fontSize: 9, padding: "3px 8px" }}
                              onClick={() => { setEditingDay(d); setEditVal(e.prevNight ? "/" + e.tour : e.tour || "b"); }}>
                              ✏
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 10, fontSize: 9, color: "#3a3d4a", lineHeight: 1.7 }}>
                  Ievades formāts: <span style={{ color: "#f59e0b" }}>70157</span> = tūre · <span style={{ color: "#4ade80" }}>/70174</span> = naktsmainis · <span style={{ color: "#4a4d5a" }}>b</span> = brīvdiena<br />
                  Enter = saglabāt · Escape = atcelt
                </div>
              </div>

              {/* PDF upload */}
              <div>
                <div style={{ background: "#161820", border: "1px solid #2a2d3a", borderRadius: 10, padding: "14px", marginBottom: 16 }}>
                  <div style={{ fontSize: 10, color: "#f59e0b", letterSpacing: 2, marginBottom: 12 }}>TŪRU PDF FAILI (KK + VVP)</div>
                  <div className="dz" onClick={() => pdfInputRef.current.click()} onDrop={onPdfDrop} onDragOver={e => e.preventDefault()}
                    style={{ minHeight: 100, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <input ref={pdfInputRef} type="file" accept="application/pdf" multiple hidden onChange={onPdfDrop} />
                    {pdfs.length === 0 ? (<>
                      <div style={{ fontSize: 24 }}>📋</div>
                      <div style={{ fontSize: 11, color: "#4a4d5a" }}>Ievelc vai klikšķini</div>
                    </>) : (
                      <div style={{ width: "100%" }}>
                        {pdfs.map((f, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid #1c1f2b", fontSize: 11 }}>
                            <span style={{ color: "#10b981", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "85%" }}>✓ {f.name}</span>
                            <button onClick={e => { e.stopPropagation(); removePdf(i); }} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 15 }}>×</button>
                          </div>
                        ))}
                        <div style={{ marginTop: 8, fontSize: 10, color: "#4a4d5a", textAlign: "center" }}>+ klikšķini lai pievienotu vēl</div>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ background: "#1a1505", border: "1px solid #3a2a0544", borderRadius: 8, padding: "10px 14px", fontSize: 10, color: "#a37a20", lineHeight: 1.7, marginBottom: 16 }}>
                  💡 Pievienojiet visus KK un VVP PDF failus lai aplikācija varētu nolasīt tūru sākuma un beigu laikus.
                </div>

                {error && <div style={{ background: "#2a1515", border: "1px solid #ef4444", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 11, color: "#ef4444" }}>⚠ {error}</div>}

                <button className="btn" onClick={buildCalendar} disabled={pdfs.length === 0 || !metaMonth}
                  style={{ width: "100%", fontSize: 15 }}>
                  IZVEIDOT KALENDĀRU →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══ LOADING ════════════════════════════════════════════════════════ */}
        {step === STEPS.LOADING && (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 36, letterSpacing: 6, color: "#f59e0b", marginBottom: 24 }}>APSTRĀDĀ...</div>
            <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 20 }}>{loadStep}</div>
            <div className="pb" style={{ maxWidth: 400, margin: "0 auto 8px" }}>
              <div className="pf" style={{ width: `${loadPct}%` }} />
            </div>
            <div style={{ fontSize: 11, color: "#4a4d5a" }}>{loadPct}%</div>
            <div style={{ marginTop: 36, display: "flex", justifyContent: "center", gap: 6 }}>
              {[0,1,2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b", animation: `pulse 1.4s ease-in-out ${i*.2}s infinite` }} />)}
            </div>
          </div>
        )}

        {/* ══ CALENDAR ═══════════════════════════════════════════════════════ */}
        {step === STEPS.CALENDAR && calData && (
          <div>
            {/* Header row */}
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 14 }}>
              <div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 50, letterSpacing: 5, lineHeight: 1 }}>{MONTH_LV[calData.month].toUpperCase()}</div>
                <div style={{ fontSize: 12, color: "#f59e0b", letterSpacing: 3, marginTop: 2 }}>{calData.year}</div>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {[
                  { v: totalWork, l: "DARBA DIENAS", c: "#3b82f6" },
                  { v: totalOff, l: "BRĪVDIENAS", c: "#10b981" },
                  { v: totalHrs, l: "STUNDAS", c: "#f59e0b" },
                ].map(({ v, l, c }) => (
                  <div key={l} className="sc" style={{ textAlign: "center", minWidth: 80 }}>
                    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: c }}>{v}</div>
                    <div style={{ fontSize: 9, color: "#4a4d5a", letterSpacing: 1 }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>

            {notFound > 0 && (
              <div style={{ background: "#2a1a10", border: "1px solid #f59e0b44", borderRadius: 8, padding: "9px 14px", marginBottom: 8, fontSize: 11, color: "#f59e0b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>⚠ {notFound} diena(-s) — tūre nav atrasta PDF failos (oranžas).</span>
                <button onClick={() => setShowDebug(v => !v)} style={{ background: "#3a2a10", border: "1px solid #f59e0b55", color: "#f59e0b", padding: "3px 10px", borderRadius: 4, cursor: "pointer", fontSize: 10, fontFamily: "monospace" }}>
                  {showDebug ? "▲ SLĒPT" : "▼ RĀDĪT PDF TŪRES"}
                </button>
              </div>
            )}

            {/* Debug: PDF tours */}
            {showDebug && calData.pdfTours && (
              <div style={{ background: "#0f1117", border: "1px solid #2a2d3a", borderRadius: 8, padding: "12px 14px", marginBottom: 14, fontSize: 11 }}>
                <div style={{ fontSize: 10, color: "#f59e0b", letterSpacing: 2, marginBottom: 10 }}>PDF FAILOS ATRASTĀS TŪRES vs MEKLĒTĀS</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 9, color: "#4a4d5a", letterSpacing: 1, marginBottom: 6 }}>ATRASTAS PDF FAILOS:</div>
                    {Object.keys(calData.pdfTours).sort().map(t => (
                      <div key={t} style={{ padding: "2px 0", borderBottom: "1px solid #1c1f2b", display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "#10b981" }}>{t}</span>
                        <span style={{ color: "#4a4d5a", fontSize: 10 }}>{calData.pdfTours[t]?.[0]?.startTime}→{calData.pdfTours[t]?.[0]?.endTime}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: "#4a4d5a", letterSpacing: 1, marginBottom: 6 }}>MEKLĒTĀS (no grafika) — STATUSS:</div>
                    {Object.entries(calData.calendar).filter(([,v]) => v.type === "work").map(([d, v]) => {
                      const found = !v.notFound;
                      return (
                        <div key={d} style={{ padding: "2px 0", borderBottom: "1px solid #1c1f2b", display: "flex", justifyContent: "space-between" }}>
                          <span style={{ color: "#6b7280" }}>{d}. → <span style={{ color: found ? "#93c5fd" : "#f87171" }}>{v.tour}</span></span>
                          <span style={{ color: found ? "#10b981" : "#ef4444", fontSize: 10 }}>{found ? "✓" : "✗ NAV"}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Legend */}
            <div style={{ display: "flex", gap: 14, marginBottom: 14, flexWrap: "wrap", fontSize: 10, color: "#6b7280" }}>
              {[
                { bg: "#1a2035", br: "#2a3a5c", l: "Darbs" },
                { bg: "#1f1535", br: "#3b2a5c", l: "🌙 Naktsmainis" },
                { bg: "#1f2a20", br: "#2a5c35", l: "↩ Nakts beigas" },
                { bg: "#111318", br: "#1a1d26", l: "Brīvdiena" },
                { bg: "#2a1a10", br: "#5c3a1a", l: "⚠ Nav atrasta" },
              ].map(({ bg, br, l }) => (
                <div key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 11, height: 11, borderRadius: 3, background: bg, border: `1px solid ${br}`, flexShrink: 0 }} />
                  {l}
                </div>
              ))}
            </div>

            {/* DOW header */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
              {DAY_LV.map(d => <div key={d} style={{ textAlign: "center", fontSize: 10, color: d === "Se" || d === "Sv" ? "#f59e0b" : "#4a4d5a", padding: "3px 0", letterSpacing: 1 }}>{d}</div>)}
            </div>

            {/* Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
              {Array.from({ length: firstDow - 1 }).map((_, i) => <div key={`e${i}`} style={{ minHeight: 86 }} />)}

              {Array.from({ length: calData.daysInMonth }).map((_, i) => {
                const d = i + 1;
                const info = calData.calendar[d];
                const isOff = !info || info.type === "off";
                const isPrev = info?.prevDayOvernight;
                const isNight = !isPrev && info?.overnight;
                const isNF = info?.notFound;
                const isSel = selectedDay === d;
                const w = new Date(calData.year, calData.month - 1, d).getDay();
                const isWE = w === 0 || w === 6;

                const cls = isOff ? "do" : isNF ? "dnf" : isPrev ? "dp" : isNight ? "dn" : "dw";

                return (
                  <div key={d} className={`dc ${cls} ${isSel ? "sel" : ""}`} onClick={() => setSelectedDay(isSel ? null : d)}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 3 }}>
                      <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 17, lineHeight: 1, color: isOff ? (isWE ? "#f59e0b44" : "#2a2d3a") : isWE ? "#fbbf24" : "#e8eaf0" }}>{d}</span>
                      {!isOff && <span style={{ fontSize: 10 }}>{isPrev ? "↩" : isNight ? "🌙" : ""}{isNF ? "⚠" : ""}</span>}
                    </div>
                    {isOff ? (
                      <div style={{ fontSize: 9, color: "#2a2d3a", letterSpacing: 1 }}>BRĪVS</div>
                    ) : (<>
                      <div style={{ fontSize: 9, color: "#f59e0b88", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{info.tour}</div>
                      {info.startTime !== "?" ? (
                        isPrev ? (<>
                          <div style={{ fontSize: 9, color: "#86efac" }}>beidzas:</div>
                          <div style={{ fontSize: 11, color: "#4ade80", fontWeight: 500 }}>{info.endTime}</div>
                        </>) : (<>
                          <div style={{ fontSize: 11, color: "#93c5fd", fontWeight: 500 }}>{info.startTime}</div>
                          <div style={{ fontSize: 10, color: "#6b7280" }}>→ {info.endTime}{isNight && <span style={{ color: "#a78bfa" }}> +1</span>}</div>
                        </>)
                      ) : <div style={{ fontSize: 9, color: "#5c3a1a" }}>nav PDF</div>}
                      {info.hours && <div style={{ position: "absolute", bottom: 4, right: 5, fontSize: 9, color: "#3a3d4a" }}>{info.hours}h</div>}
                    </>)}
                  </div>
                );
              })}
            </div>

            {/* Day detail */}
            {selectedDay && selDay && (
              <div style={{ marginTop: 18, background: "#161820", border: `1px solid ${selDay.type==="off" ? "#2a2d3a" : selDay.prevDayOvernight ? "#2a5c35" : selDay.overnight ? "#3b2a5c" : "#2a3a5c"}`, borderRadius: 12, padding: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 50, color: "#f59e0b", lineHeight: 1 }}>{selectedDay}</div>
                    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, letterSpacing: 3 }}>{MONTH_LV[calData.month].toUpperCase()}</div>
                    <div style={{ fontSize: 10, color: "#4a4d5a", letterSpacing: 2, marginTop: 2 }}>
                      {DOW_LV[(() => { const w = new Date(calData.year, calData.month-1, selectedDay).getDay(); return w===0?7:w; })()]}
                    </div>
                  </div>
                  {selDay.type !== "off" && (
                    <div style={{ flex: 1, display: "flex", gap: 22, flexWrap: "wrap" }}>
                      {selDay.prevDayOvernight ? (
                        <div>
                          <div style={{ fontSize: 10, color: "#4a4d5a", letterSpacing: 1, marginBottom: 4 }}>DARBS SĀKĀS IEPRIEKŠĒJĀ DIENĀ</div>
                          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, color: "#86efac", letterSpacing: 2 }}>BEIDZAS ŠODIEN</div>
                          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 38, color: "#4ade80" }}>{selDay.endTime}</div>
                        </div>
                      ) : (<>
                        <div>
                          <div style={{ fontSize: 10, color: "#4a4d5a", letterSpacing: 1, marginBottom: 4 }}>SĀKUMS</div>
                          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 38, color: "#3b82f6" }}>{selDay.startTime}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: "#4a4d5a", letterSpacing: 1, marginBottom: 4 }}>BEIGAS{selDay.overnight ? " (+1 diena)" : ""}</div>
                          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 38, color: selDay.overnight ? "#8b5cf6" : "#10b981" }}>{selDay.endTime}</div>
                        </div>
                        {selDay.hours && (
                          <div>
                            <div style={{ fontSize: 10, color: "#4a4d5a", letterSpacing: 1, marginBottom: 4 }}>STUNDAS</div>
                            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 38, color: "#f59e0b" }}>{selDay.hours}</div>
                          </div>
                        )}
                      </>)}
                    </div>
                  )}
                  {selDay.type === "off" && <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, color: "#10b981", letterSpacing: 3 }}>BRĪVDIENA</div>}
                </div>
                {selDay.type !== "off" && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #1c1f2b", display: "flex", gap: 7, flexWrap: "wrap" }}>
                    <span className="tg" style={{ background: "#1c2335", color: "#60a5fa", border: "1px solid #2a3a5c" }}>TŪRE: {selDay.tour}</span>
                    {selDay.overnight && <span className="tg" style={{ background: "#1f1535", color: "#a78bfa", border: "1px solid #3b2a5c" }}>🌙 NAKTSMAINIS</span>}
                    {selDay.prevDayOvernight && <span className="tg" style={{ background: "#1f2a20", color: "#4ade80", border: "1px solid #2a5c35" }}>↩ IEPRIEKŠĒJĀ NAKTS BEIGAS</span>}
                    {selDay.notFound && <span className="tg" style={{ background: "#2a1a10", color: "#f59e0b", border: "1px solid #5c3a1a" }}>⚠ NAV PDF FAILĀ</span>}
                    {!selDay.prevDayOvernight && selDay.startTime !== "?" && (
                      <span className="tg" style={{ background: "#1a2a1a", color: "#4ade80", border: "1px solid #2a3a2a" }}>
                        {(() => { const [sh,sm]=selDay.startTime.split(":").map(Number); const [eh,em]=selDay.endTime.split(":").map(Number); let m=(eh*60+em)-(sh*60+sm);if(m<0)m+=1440; return `${Math.floor(m/60)}h ${m%60}min`; })()}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
