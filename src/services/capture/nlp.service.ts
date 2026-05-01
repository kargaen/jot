import type { NlpLanguageMode, ParsedInput, Project, Tag } from "../../models/shared";

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function nextWeekday(target: number): Date {
  const d = new Date();
  const day = d.getDay();
  let diff = target - day;
  if (diff <= 0) diff += 7;
  d.setDate(d.getDate() + diff);
  return d;
}

function trigramSimilarity(a: string, b: string): number {
  const trigrams = (s: string) => {
    const padded = `  ${s} `;
    const set = new Set<string>();
    for (let i = 0; i < padded.length - 2; i++) set.add(padded.slice(i, i + 3));
    return set;
  };
  const ta = trigrams(a);
  const tb = trigrams(b);
  let intersection = 0;
  ta.forEach((t) => {
    if (tb.has(t)) intersection++;
  });
  return (2 * intersection) / (ta.size + tb.size);
}

// ── Weekdays (EN + DA) ──────────────────────────────────────────
const WEEKDAYS: Record<string, number> = {
  // English
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
  // Danish
  søndag: 0, søn: 0,
  mandag: 1,
  tirsdag: 2, tir: 2,
  onsdag: 3, ons: 3,
  torsdag: 4, tor: 4,
  fredag: 5, fre: 5,
  lørdag: 6, lør: 6,
};

const ENGLISH_DAY_KEYS = [
  "sunday", "sun",
  "monday", "mon",
  "tuesday", "tue", "tues",
  "wednesday", "wed",
  "thursday", "thu", "thur", "thurs",
  "friday", "fri",
  "saturday", "sat",
];

const DANISH_DAY_KEYS = [
  "sÃ¸ndag", "sÃ¸n",
  "s\u00f8ndag", "s\u00f8n",
  "mandag",
  "tirsdag", "tir",
  "onsdag", "ons",
  "torsdag", "tor",
  "fredag", "fre",
  "lÃ¸rdag", "lÃ¸r",
  "l\u00f8rdag", "l\u00f8r",
];

// ── Months (EN + DA) ────────────────────────────────────────────
const MONTHS: Record<string, number> = {
  // English
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
  // Danish full names
  januar: 0, februar: 1, marts: 2,
  maj: 4,
  juni: 5,
  juli: 6,
  okt: 9, oktober: 9,
};

const ENGLISH_MONTH_KEYS = [
  "jan", "january",
  "feb", "february",
  "mar", "march",
  "apr", "april",
  "may",
  "jun", "june",
  "jul", "july",
  "aug", "august",
  "sep", "sept", "september",
  "oct", "october",
  "nov", "november",
  "dec", "december",
];

const DANISH_MONTH_KEYS = [
  "januar", "februar", "marts",
  "maj", "juni", "juli",
  "okt", "oktober",
];

// ── Weekday → RRULE BYDAY mapping ──────────────────────────────
const WEEKDAY_BYDAY: Record<string, string> = {
  sunday: "SU", sun: "SU", søndag: "SU", søn: "SU",
  monday: "MO", mon: "MO", mandag: "MO",
  tuesday: "TU", tue: "TU", tues: "TU", tirsdag: "TU", tir: "TU",
  wednesday: "WE", wed: "WE", onsdag: "WE", ons: "WE",
  thursday: "TH", thu: "TH", thur: "TH", thurs: "TH", torsdag: "TH", tor: "TH",
  friday: "FR", fri: "FR", fredag: "FR", fre: "FR",
  saturday: "SA", sat: "SA", lørdag: "SA", lør: "SA",
};

const ENGLISH_BYDAY_KEYS = [
  "sunday", "sun",
  "monday", "mon",
  "tuesday", "tue", "tues",
  "wednesday", "wed",
  "thursday", "thu", "thur", "thurs",
  "friday", "fri",
  "saturday", "sat",
];

const DANISH_BYDAY_KEYS = [
  "sÃ¸ndag", "sÃ¸n",
  "mandag",
  "tirsdag", "tir",
  "onsdag", "ons",
  "torsdag", "tor",
  "fredag", "fre",
  "lÃ¸rdag", "lÃ¸r",
];

interface DateResult {
  date: string;
  time: string | null;
  consumed: string;
}

interface ParseOptions {
  languageMode?: NlpLanguageMode;
}

function allowsEnglish(mode: NlpLanguageMode) {
  return mode !== "da";
}

function allowsDanish(mode: NlpLanguageMode) {
  return mode !== "en";
}

function keysForMode(
  mode: NlpLanguageMode,
  english: string[],
  danish: string[],
) {
  if (mode === "en") return english;
  if (mode === "da") return danish;
  return [...english, ...danish];
}

function resolveWeekday(key: string): number | undefined {
  if (key in WEEKDAYS) return WEEKDAYS[key];
  if (key === "s\u00f8ndag" || key === "s\u00f8n") return 0;
  if (key === "l\u00f8rdag" || key === "l\u00f8r") return 6;
  return undefined;
}

function timePrefixPattern(mode: NlpLanguageMode) {
  if (mode === "en") return "(?:at)";
  if (mode === "da") return "(?:kl\\.?|klokken)";
  return "(?:at|kl\\.?|klokken)";
}

function literalTimePattern(mode: NlpLanguageMode) {
  if (mode === "en") return "(?:noon|midnight)";
  if (mode === "da") return "(?:middag|midnat)";
  return "(?:noon|midnight|middag|midnat)";
}

function parseLiteralTime(value: string): string | null {
  const normalized = value.toLowerCase();
  if (normalized === "noon" || normalized === "middag") return "12:00";
  if (normalized === "midnight" || normalized === "midnat") return "00:00";
  return null;
}

function parseDateEnglishOnly(input: string): DateResult | null {
  const lower = input.toLowerCase();
  const today = new Date();
  let m: RegExpMatchArray | null;

  m = lower.match(/(^|\s)@([\w-]+)/i);
  if (m) {
    const inner = parseDateEnglishOnly(m[2].replace(/-/g, " ").trim());
    if (inner) {
      const rest = input.slice((m.index ?? 0) + m[0].length);
      const { time, consumed } = parseTimeSuffix(rest, "en");
      return { date: inner.date, time, consumed: m[0] + consumed };
    }
  }

  m = lower.match(/(^|\s)(today)(?=\s|$)/);
  if (m) return withTime(input, m, today, "en");

  m = lower.match(/(^|\s)((?:the\s+)?day\s+after\s+tomorrow)(?=\s|$)/);
  if (m) {
    const d = new Date(today);
    d.setDate(d.getDate() + 2);
    return withTime(input, m, d, "en");
  }

  m = lower.match(/(^|\s)(tomorrow)(?=\s|$)/);
  if (m) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return withTime(input, m, d, "en");
  }

  m = lower.match(/(^|\s)(tonight|this\s+evening)(?=\s|$)/);
  if (m) return { date: toISODate(today), time: "19:00", consumed: m[0] };

  m = lower.match(/(^|\s)(this\s+afternoon)(?=\s|$)/);
  if (m) return { date: toISODate(today), time: "15:00", consumed: m[0] };

  m = lower.match(/(^|\s)(next\s+week)(?=\s|$)/);
  if (m) {
    const d = new Date(today);
    d.setDate(d.getDate() + 7);
    return { date: toISODate(d), time: null, consumed: m[0] };
  }

  m = lower.match(/(^|\s)(next\s+month)(?=\s|$)/);
  if (m) {
    const d = new Date(today);
    d.setMonth(d.getMonth() + 1);
    return { date: toISODate(d), time: null, consumed: m[0] };
  }

  m = lower.match(/(^|\s)(next\s+year)(?=\s|$)/);
  if (m) {
    const d = new Date(today);
    d.setFullYear(d.getFullYear() + 1);
    return { date: toISODate(d), time: null, consumed: m[0] };
  }

  m = lower.match(/(^|\s)(end\s+of\s+(?:the\s+)?week)(?=\s|$)/);
  if (m) return { date: toISODate(nextWeekday(5)), time: null, consumed: m[0] };

  m = lower.match(/(^|\s)(end\s+of\s+(?:the\s+)?month)(?=\s|$)/);
  if (m) {
    const d = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { date: toISODate(d), time: null, consumed: m[0] };
  }

  m = lower.match(/(^|\s)(?:in)\s+(\d+)\s+(minutes?|hours?|days?|weeks?|months?|years?)/);
  if (m) {
    const n = parseInt(m[2]);
    const unit = m[3];
    const d = new Date(today);
    if (/^(minutes?)$/.test(unit)) {
      d.setMinutes(d.getMinutes() + n);
      return { date: toISODate(d), time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`, consumed: m[0] };
    }
    if (/^(hours?)$/.test(unit)) {
      d.setHours(d.getHours() + n);
      return { date: toISODate(d), time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`, consumed: m[0] };
    }
    if (/^(days?)$/.test(unit)) d.setDate(d.getDate() + n);
    else if (/^(weeks?)$/.test(unit)) d.setDate(d.getDate() + n * 7);
    else if (/^(years?)$/.test(unit)) d.setFullYear(d.getFullYear() + n);
    else d.setMonth(d.getMonth() + n);
    return { date: toISODate(d), time: null, consumed: m[0] };
  }

  for (const day of ENGLISH_DAY_KEYS.sort((a, b) => b.length - a.length)) {
    m = lower.match(new RegExp(`(^|\\s)(?:next|this|on)\\s+(${day})(?=\\s|$)`, "i"));
    if (m) return withTime(input, m, nextWeekday(resolveWeekday(day) ?? 0), "en");
  }

  for (const day of ENGLISH_DAY_KEYS.sort((a, b) => b.length - a.length)) {
    m = lower.match(new RegExp(`(^|\\s)(${day})(?=\\s|$)`, "i"));
    if (m) return withTime(input, m, nextWeekday(resolveWeekday(day) ?? 0), "en");
  }

  for (const mon of ENGLISH_MONTH_KEYS.sort((a, b) => b.length - a.length)) {
    m = lower.match(new RegExp(`(^|\\s)(${mon})\\s+(\\d{1,2})(?:st|nd|rd|th|\\.)?(?=\\s|$)`, "i"));
    if (m) {
      const d = new Date(today.getFullYear(), MONTHS[mon], parseInt(m[3]));
      if (d < today) d.setFullYear(d.getFullYear() + 1);
      return { date: toISODate(d), time: null, consumed: m[0] };
    }
    m = lower.match(new RegExp(`(^|\\s)(\\d{1,2})(?:st|nd|rd|th)?\\.?\\s+(${mon})(?=\\s|$)`, "i"));
    if (m) {
      const d = new Date(today.getFullYear(), MONTHS[mon], parseInt(m[2]));
      if (d < today) d.setFullYear(d.getFullYear() + 1);
      return { date: toISODate(d), time: null, consumed: m[0] };
    }
  }

  m = lower.match(/(^|\s)(\d{4})-(\d{2})-(\d{2})(?=\s|$)/);
  if (m) return { date: toISODate(new Date(parseInt(m[2]), parseInt(m[3]) - 1, parseInt(m[4]))), time: null, consumed: m[0] };

  m = lower.match(/(due)\s+/);
  if (m) {
    const inner = parseDateEnglishOnly(input.slice(m.index! + m[0].length));
    if (inner) return { ...inner, consumed: m[0] + inner.consumed };
  }

  return null;
}

function parseDateDanishOnly(input: string): DateResult | null {
  const lower = input.toLowerCase();
  const today = new Date();
  let m: RegExpMatchArray | null;

  m = lower.match(/(^|\s)@([\wÃ¦Ã¸Ã¥Ã†Ã˜Ã…-]+)/i);
  if (m) {
    const inner = parseDateDanishOnly(m[2].replace(/-/g, " ").trim());
    if (inner) {
      const rest = input.slice((m.index ?? 0) + m[0].length);
      const { time, consumed } = parseTimeSuffix(rest, "da");
      return { date: inner.date, time, consumed: m[0] + consumed };
    }
  }

  m = lower.match(/(^|\s)(i\s+dag)(?=\s|$)/);
  if (m) return withTime(input, m, today, "da");

  m = lower.match(/(^|\s)(i\s+overmorgen|overmorgen)(?=\s|$)/);
  if (m) {
    const d = new Date(today);
    d.setDate(d.getDate() + 2);
    return withTime(input, m, d, "da");
  }

  m = lower.match(/(^|\s)(i\s+morgen)(?=\s|$)/);
  if (m) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return withTime(input, m, d, "da");
  }

  m = lower.match(/(^|\s)(i\s+aften)(?=\s|$)/);
  if (m) return { date: toISODate(today), time: "19:00", consumed: m[0] };

  m = lower.match(/(^|\s)(i\s+eftermiddag)(?=\s|$)/);
  if (m) return { date: toISODate(today), time: "15:00", consumed: m[0] };

  m = lower.match(/(^|\s)(nÃ¦ste\s+uge)(?=\s|$)/);
  if (m) {
    const d = new Date(today);
    d.setDate(d.getDate() + 7);
    return { date: toISODate(d), time: null, consumed: m[0] };
  }

  m = lower.match(/(^|\s)(nÃ¦ste\s+mÃ¥ned)(?=\s|$)/);
  if (m) {
    const d = new Date(today);
    d.setMonth(d.getMonth() + 1);
    return { date: toISODate(d), time: null, consumed: m[0] };
  }

  m = lower.match(/(^|\s)(nÃ¦ste\s+Ã¥r)(?=\s|$)/);
  if (m) {
    const d = new Date(today);
    d.setFullYear(d.getFullYear() + 1);
    return { date: toISODate(d), time: null, consumed: m[0] };
  }

  m = lower.match(/(^|\s)((?:i\s+)?slutningen\s+af\s+ugen)(?=\s|$)/);
  if (m) return { date: toISODate(nextWeekday(5)), time: null, consumed: m[0] };

  m = lower.match(/(^|\s)((?:i\s+)?slutningen\s+af\s+mÃ¥neden)(?=\s|$)/);
  if (m) {
    const d = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { date: toISODate(d), time: null, consumed: m[0] };
  }

  m = lower.match(/(^|\s)(?:om)\s+(\d+)\s+(minutter?|timer?|dage?|uger?|mÃ¥ned(?:er)?|Ã¥r)/);
  if (m) {
    const n = parseInt(m[2]);
    const unit = m[3];
    const d = new Date(today);
    if (/^(minutter?)$/.test(unit)) {
      d.setMinutes(d.getMinutes() + n);
      return { date: toISODate(d), time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`, consumed: m[0] };
    }
    if (/^(timer?)$/.test(unit)) {
      d.setHours(d.getHours() + n);
      return { date: toISODate(d), time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`, consumed: m[0] };
    }
    if (/^(dage?)$/.test(unit)) d.setDate(d.getDate() + n);
    else if (/^(uger?)$/.test(unit)) d.setDate(d.getDate() + n * 7);
    else if (/^(Ã¥r)$/.test(unit)) d.setFullYear(d.getFullYear() + n);
    else d.setMonth(d.getMonth() + n);
    return { date: toISODate(d), time: null, consumed: m[0] };
  }

  for (const day of DANISH_DAY_KEYS.sort((a, b) => b.length - a.length)) {
    m = lower.match(new RegExp(`(^|\\s)(?:nÃ¦ste|denne|pÃ¥)\\s+(${day})(?=\\s|$)`, "i"));
    if (m) return withTime(input, m, nextWeekday(resolveWeekday(day) ?? 0), "da");
  }

  for (const day of DANISH_DAY_KEYS.sort((a, b) => b.length - a.length)) {
    m = lower.match(new RegExp(`(^|\\s)(${day})(?=\\s|$)`, "i"));
    if (m) return withTime(input, m, nextWeekday(resolveWeekday(day) ?? 0), "da");
  }

  for (const mon of DANISH_MONTH_KEYS.sort((a, b) => b.length - a.length)) {
    m = lower.match(new RegExp(`(^|\\s)(${mon})\\s+(\\d{1,2})(?:\\.)?(?=\\s|$)`, "i"));
    if (m) {
      const d = new Date(today.getFullYear(), MONTHS[mon], parseInt(m[3]));
      if (d < today) d.setFullYear(d.getFullYear() + 1);
      return { date: toISODate(d), time: null, consumed: m[0] };
    }
    m = lower.match(new RegExp(`(^|\\s)(?:den|d\\.?)?\\s*(\\d{1,2})\\.?\\s+(${mon})(?=\\s|$)`, "i"));
    if (m) {
      const d = new Date(today.getFullYear(), MONTHS[mon], parseInt(m[2]));
      if (d < today) d.setFullYear(d.getFullYear() + 1);
      return { date: toISODate(d), time: null, consumed: m[0] };
    }
  }

  m = lower.match(/(^|\s)(?:den|d\.?)\s+(\d{1,2})\.?(?=\s|$)/);
  if (m) {
    const day = parseInt(m[2]);
    if (day >= 1 && day <= 31) {
      const d = new Date(today.getFullYear(), today.getMonth(), day);
      if (d <= today) d.setMonth(d.getMonth() + 1);
      return { date: toISODate(d), time: null, consumed: m[0] };
    }
  }

  m = lower.match(/(^|\s)(\d{4})-(\d{2})-(\d{2})(?=\s|$)/);
  if (m) return { date: toISODate(new Date(parseInt(m[2]), parseInt(m[3]) - 1, parseInt(m[4]))), time: null, consumed: m[0] };

  m = lower.match(/(inden|til)\s+/);
  if (m) {
    const inner = parseDateDanishOnly(input.slice(m.index! + m[0].length));
    if (inner) return { ...inner, consumed: m[0] + inner.consumed };
  }

  return null;
}

// ── Time suffix: "at 14:00" / "kl 14" / "klokken 14:30" ────────
function parseTimeSuffix(after: string, mode: NlpLanguageMode = "auto"): {
  time: string | null;
  consumed: string;
} {
  const prefix = timePrefixPattern(mode);
  const literal = after.match(
    new RegExp(`^\\s+${prefix}\\s+(${literalTimePattern(mode)})(?=\\s|$)`, "i"),
  );
  if (literal) {
    const time = parseLiteralTime(literal[1]);
    return {
      time,
      consumed: literal[0],
    };
  }
  const m = after.match(new RegExp(
    `^\\s+${prefix}\\s+(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?`,
    "i",
  ));
  if (!m) return { time: null, consumed: "" };
  let h = parseInt(m[1]);
  const min = m[2] ? parseInt(m[2]) : 0;
  const ampm = m[3]?.toLowerCase();
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  const time = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  return { time, consumed: m[0] };
}

/** Build a DateResult, checking for an optional time suffix after the match. */
function withTime(
  input: string,
  match: RegExpMatchArray,
  d: Date,
  mode: NlpLanguageMode = "auto",
): DateResult {
  const rest = input.slice(match.index! + match[0].length);
  const { time, consumed } = parseTimeSuffix(rest, mode);
  return { date: toISODate(d), time, consumed: match[0] + consumed };
}

// We use (?=\\s|$) instead of \\b because \\b breaks on Danish chars (ø, å).
// Weekday/month keys sorted longest-first so "thursday" matches before "thu".
export function parseDate(
  input: string,
  options: ParseOptions = {},
): DateResult | null {
  const mode = options.languageMode ?? "auto";
  if (mode === "en") return parseDateEnglishOnly(input);
  if (mode === "da") return parseDateDanishOnly(input);
  const sortedDayKeys = keysForMode(mode, ENGLISH_DAY_KEYS, DANISH_DAY_KEYS).sort(
    (a, b) => b.length - a.length,
  );
  const sortedMonthKeys = keysForMode(mode, ENGLISH_MONTH_KEYS, DANISH_MONTH_KEYS).sort(
    (a, b) => b.length - a.length,
  );
  const lower = input.toLowerCase();
  const today = new Date();

  let m: RegExpMatchArray | null;

  // ── 0. Explicit @ date prefix ─────────────────────────────────
  // "@monday", "@tomorrow", "@fredag", "@next-week" (hyphen = space).
  // Takes priority over implicit patterns so the user can force date
  // parsing on any term without ambiguity.
  m = lower.match(/(^|\s)@([\wæøåÆØÅ-]+)/i);
  if (m) {
    const candidate = m[2].replace(/-/g, " ").trim();
    const inner = parseDate(candidate, options);
    if (inner) {
      const rest = input.slice((m.index ?? 0) + m[0].length);
      const { time, consumed: timeSuffix } = parseTimeSuffix(rest, mode);
      return { date: inner.date, time, consumed: m[0] + timeSuffix };
    }
  }

  // ── 1. Relative dates (EN + DA) ───────────────────────────────

  // today / i dag
  if (allowsEnglish(mode)) {
    m = lower.match(/(^|\s)(today)(?=\s|$)/);
    if (m) return withTime(input, m, today, mode);
  }
  if (allowsDanish(mode)) {
    m = lower.match(/(^|\s)(i\s+dag)(?=\s|$)/);
    if (m) return withTime(input, m, today, mode);
  }

  // day after tomorrow / i overmorgen / overmorgen — checked BEFORE tomorrow
  if (allowsEnglish(mode)) {
    m = lower.match(/(^|\s)((?:the\s+)?day\s+after\s+tomorrow)(?=\s|$)/);
    if (m) {
      const d = new Date(today);
      d.setDate(d.getDate() + 2);
      return withTime(input, m, d, mode);
    }
  }
  if (allowsDanish(mode)) {
    m = lower.match(/(^|\s)(i\s+overmorgen|overmorgen)(?=\s|$)/);
    if (m) {
      const d = new Date(today);
      d.setDate(d.getDate() + 2);
      return withTime(input, m, d, mode);
    }
  }

  // tomorrow / i morgen
  if (allowsEnglish(mode)) {
    m = lower.match(/(^|\s)(tomorrow)(?=\s|$)/);
    if (m) {
      const d = new Date(today);
      d.setDate(d.getDate() + 1);
      return withTime(input, m, d, mode);
    }
  }
  if (allowsDanish(mode)) {
    m = lower.match(/(^|\s)(i\s+morgen)(?=\s|$)/);
    if (m) {
      const d = new Date(today);
      d.setDate(d.getDate() + 1);
      return withTime(input, m, d, mode);
    }
  }

  // tonight / this evening / i aften
  if (allowsEnglish(mode)) {
    m = lower.match(/(^|\s)(tonight|this\s+evening)(?=\s|$)/);
    if (m) return { date: toISODate(today), time: "19:00", consumed: m[0] };
  }
  if (allowsDanish(mode)) {
    m = lower.match(/(^|\s)(i\s+aften)(?=\s|$)/);
    if (m) return { date: toISODate(today), time: "19:00", consumed: m[0] };
  }

  // this afternoon / i eftermiddag
  if (allowsEnglish(mode)) {
    m = lower.match(/(^|\s)(this\s+afternoon)(?=\s|$)/);
    if (m) return { date: toISODate(today), time: "15:00", consumed: m[0] };
  }
  if (allowsDanish(mode)) {
    m = lower.match(/(^|\s)(i\s+eftermiddag)(?=\s|$)/);
    if (m) return { date: toISODate(today), time: "15:00", consumed: m[0] };
  }

  // ── 2. Relative periods (EN + DA) ─────────────────────────────

  // next week / næste uge
  m = lower.match(/(^|\s)(next\s+week|næste\s+uge)(?=\s|$)/);
  if (m) {
    const d = new Date(today);
    d.setDate(d.getDate() + 7);
    return { date: toISODate(d), time: null, consumed: m[0] };
  }

  // next month / næste måned
  m = lower.match(/(^|\s)(next\s+month|næste\s+måned)(?=\s|$)/);
  if (m) {
    const d = new Date(today);
    d.setMonth(d.getMonth() + 1);
    return { date: toISODate(d), time: null, consumed: m[0] };
  }

  // next year / næste år
  m = lower.match(/(^|\s)(next\s+year|næste\s+år)(?=\s|$)/);
  if (m) {
    const d = new Date(today);
    d.setFullYear(d.getFullYear() + 1);
    return { date: toISODate(d), time: null, consumed: m[0] };
  }

  // end of week / slutningen af ugen
  m = lower.match(
    /(^|\s)(end\s+of\s+(?:the\s+)?week|(?:i\s+)?slutningen\s+af\s+ugen)(?=\s|$)/,
  );
  if (m) {
    const d = nextWeekday(5); // Friday
    return { date: toISODate(d), time: null, consumed: m[0] };
  }

  // end of month / slutningen af måneden
  m = lower.match(
    /(^|\s)(end\s+of\s+(?:the\s+)?month|(?:i\s+)?slutningen\s+af\s+måneden)(?=\s|$)/,
  );
  if (m) {
    const d = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { date: toISODate(d), time: null, consumed: m[0] };
  }

  // ── 3. in N units / om N enheder ──────────────────────────────

  m = lower.match(
    /(^|\s)(?:in|om)\s+(\d+)\s+(minutes?|minutter?|hours?|timer?|days?|dage?|weeks?|uger?|months?|måned(?:er)?|years?|år)/,
  );
  if (m) {
    const n = parseInt(m[2]);
    const unit = m[3];
    const d = new Date(today);
    if (/^(minutes?|minutter?)$/.test(unit)) {
      d.setMinutes(d.getMinutes() + n);
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return { date: toISODate(d), time: `${hh}:${mm}`, consumed: m[0] };
    } else if (/^(hours?|timer?)$/.test(unit)) {
      d.setHours(d.getHours() + n);
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return { date: toISODate(d), time: `${hh}:${mm}`, consumed: m[0] };
    } else if (/^(days?|dage?)$/.test(unit)) d.setDate(d.getDate() + n);
    else if (/^(weeks?|uger?)$/.test(unit)) d.setDate(d.getDate() + n * 7);
    else if (/^(years?|år)$/.test(unit)) d.setFullYear(d.getFullYear() + n);
    else d.setMonth(d.getMonth() + n);
    return { date: toISODate(d), time: null, consumed: m[0] };
  }

  // ── 4. Prefixed weekdays: next/this/on/næste/denne/på [day] ───

  for (const day of sortedDayKeys) {
    const re = new RegExp(
      `(^|\\s)(?:next|næste|this|denne|on|på)\\s+(${day})(?=\\s|$)`,
      "i",
    );
    m = lower.match(re);
    if (m) {
      const d = nextWeekday(resolveWeekday(day) ?? 0);
      return withTime(input, m, d);
    }
  }

  // ── 5. Bare weekdays ──────────────────────────────────────────

  for (const day of sortedDayKeys) {
    const re = new RegExp(`(^|\\s)(${day})(?=\\s|$)`, "i");
    m = lower.match(re);
    if (m) {
      const d = nextWeekday(resolveWeekday(day) ?? 0);
      return withTime(input, m, d);
    }
  }

  // ── 6. Month + day: "jan 15" / "15th january" / "15. januar" ──

  for (const mon of sortedMonthKeys) {
    // "jan 15" / "january 15th"
    const re1 = new RegExp(
      `(^|\\s)(${mon})\\s+(\\d{1,2})(?:st|nd|rd|th|\\.)?(?=\\s|$)`,
      "i",
    );
    m = lower.match(re1);
    if (m) {
      const d = new Date(today.getFullYear(), MONTHS[mon], parseInt(m[3]));
      if (d < today) d.setFullYear(d.getFullYear() + 1);
      return { date: toISODate(d), time: null, consumed: m[0] };
    }
    // "15 jan" / "15th january" / "15. januar" / "den 15. jan" / "d. 15. maj"
    const re2 = new RegExp(
      `(^|\\s)(?:den|d\\.?)?\\s*(\\d{1,2})(?:st|nd|rd|th)?\\.?\\s+(${mon})(?=\\s|$)`,
      "i",
    );
    m = lower.match(re2);
    if (m) {
      const d = new Date(today.getFullYear(), MONTHS[mon], parseInt(m[2]));
      if (d < today) d.setFullYear(d.getFullYear() + 1);
      return { date: toISODate(d), time: null, consumed: m[0] };
    }
  }

  // ── 7. Danish "den 15." / "d. 15" (day of current/next month) ─

  m = lower.match(/(^|\s)(?:den|d\.?)\s+(\d{1,2})\.?(?=\s|$)/);
  if (m) {
    const day = parseInt(m[2]);
    if (day >= 1 && day <= 31) {
      const d = new Date(today.getFullYear(), today.getMonth(), day);
      if (d <= today) d.setMonth(d.getMonth() + 1);
      return { date: toISODate(d), time: null, consumed: m[0] };
    }
  }

  // ── 8. ISO date: 2026-04-15 ───────────────────────────────────

  m = lower.match(/(^|\s)(\d{4})-(\d{2})-(\d{2})(?=\s|$)/);
  if (m) {
    const d = new Date(
      parseInt(m[2]),
      parseInt(m[3]) - 1,
      parseInt(m[4]),
    );
    return { date: toISODate(d), time: null, consumed: m[0] };
  }

  // ── 9. "due" / "inden" / "til" prefix — strip and re-parse ───

  m = lower.match(/(due|inden|til)\s+/);
  if (m) {
    const inner = parseDate(input.slice(m.index! + m[0].length));
    if (inner) {
      inner.consumed = m[0] + inner.consumed;
      return inner;
    }
  }

  return null;
}

// ── Recurrence ──────────────────────────────────────────────────

export function parseRecurrence(
  input: string,
  options: ParseOptions = {},
): { rule: string; consumed: string } | null {
  const mode = options.languageMode ?? "auto";
  const lower = input.toLowerCase();
  const sortedBydayKeys = keysForMode(mode, ENGLISH_BYDAY_KEYS, DANISH_BYDAY_KEYS).sort(
    (a, b) => b.length - a.length,
  );

  const patterns: Array<{ re: RegExp; rule: string }> = [];
  if (allowsEnglish(mode)) {
    patterns.push(
      { re: /every\s+day|daily/, rule: "FREQ=DAILY" },
      { re: /every\s+weekday|each\s+weekday/, rule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" },
      { re: /every\s+weekend|each\s+weekend/, rule: "FREQ=WEEKLY;BYDAY=SA,SU" },
      { re: /every\s+week|weekly/, rule: "FREQ=WEEKLY" },
      { re: /every\s+month|monthly/, rule: "FREQ=MONTHLY" },
      { re: /every\s+year|yearly|annually/, rule: "FREQ=YEARLY" },
      { re: /every\s+(\d+)\s+days?/, rule: "FREQ=DAILY" },
      { re: /every\s+(\d+)\s+weeks?/, rule: "FREQ=WEEKLY" },
      { re: /every\s+(\d+)\s+months?/, rule: "FREQ=MONTHLY" },
    );
  }
  if (allowsDanish(mode)) {
    patterns.push(
      { re: /hver\s+dag|dagligt/, rule: "FREQ=DAILY" },
      { re: /hver\s+hverdag/, rule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" },
      { re: /hver\s+weekend/, rule: "FREQ=WEEKLY;BYDAY=SA,SU" },
      { re: /hver\s+uge|ugentligt/, rule: "FREQ=WEEKLY" },
      { re: /hver\s+m(?:\u00e5|aa)ned|m(?:\u00e5|aa)nedligt/, rule: "FREQ=MONTHLY" },
      { re: /hver\s+(?:\u00e5|aa)r|(?:\u00e5|aa)rligt/, rule: "FREQ=YEARLY" },
      { re: /hver\s+(\d+)\.\s*(dag|dage?)/, rule: "FREQ=DAILY" },
      { re: /hver\s+(\d+)\.\s*(uge|uger?)/, rule: "FREQ=WEEKLY" },
      { re: /hver\s+(\d+)\.\s*m(?:\u00e5|aa)ned(?:er)?/, rule: "FREQ=MONTHLY" },
    );
  }
  /*
    { re: /every\s+day|daily|hver\s+dag|dagligt/, rule: "FREQ=DAILY" },
    { re: /every\s+weekday|each\s+weekday|hver\s+hverdag/, rule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" },
    { re: /every\s+weekend|each\s+weekend|hver\s+weekend/, rule: "FREQ=WEEKLY;BYDAY=SA,SU" },
    { re: /every\s+week|weekly|hver\s+uge|ugentligt/, rule: "FREQ=WEEKLY" },
    {
      re: /every\s+month|monthly|hver\s+måned|månedligt/,
      rule: "FREQ=MONTHLY",
    },
    {
      re: /every\s+year|yearly|annually|hver\s+år|årligt/,
      rule: "FREQ=YEARLY",
    },
    { re: /every\s+(\d+)\s+(days|dage?)/, rule: "FREQ=DAILY" },
    { re: /every\s+(\d+)\s+(weeks|uger?)/, rule: "FREQ=WEEKLY" },
    { re: /every\s+(\d+)\s+(months|måned(?:er)?)/, rule: "FREQ=MONTHLY" },
    { re: /hver\s+(\d+)\.\s*(dag|dage?)/, rule: "FREQ=DAILY" },
    { re: /hver\s+(\d+)\.\s*(uge|uger?)/, rule: "FREQ=WEEKLY" },
    { re: /hver\s+(\d+)\.\s*måned(?:er)?/, rule: "FREQ=MONTHLY" },
  ];

  */
  for (const { re, rule } of patterns) {
    const m = lower.match(re);
    if (m) {
      // "every N days/weeks" — extract interval
      const interval = m[1] ? parseInt(m[1]) : 0;
      if (interval > 0) {
        return {
          rule: `${rule};INTERVAL=${interval}`,
          consumed: m[0],
        };
      }
      return { rule, consumed: m[0] };
    }
  }

  const weekdayPrefix =
    mode === "en" ? "every" : mode === "da" ? "hver" : "(?:every|hver)";
  for (const day of sortedBydayKeys) {
    const re = new RegExp(`${weekdayPrefix}\\s+(${day})(?=\\s|$)`, "i");
    const m = lower.match(re);
    if (m) {
      return {
        rule: `FREQ=WEEKLY;BYDAY=${WEEKDAY_BYDAY[day]}`,
        consumed: m[0],
      };
    }
  }

  return null;
}

// ── Priority ────────────────────────────────────────────────────

type Priority = "high" | "medium" | "low" | "none";

export function parsePriority(
  input: string,
  options: ParseOptions = {},
): { priority: Priority; consumed: string } | null {
  const mode = options.languageMode ?? "auto";
  // Trailing ! (one or more) = high priority — check first so it's consumed
  // and doesn't end up in the task title.
  const trailingBang = input.match(/\s*!+\s*$/);
  if (trailingBang) {
    return { priority: "high", consumed: trailingBang[0] };
  }

  const patterns: Array<{ re: RegExp; priority: Priority }> = [
    ...(allowsEnglish(mode)
      ? [
          { re: /(^|\s)!?(urgent|asap|critical|!!|!1)(?=\s|$)/i, priority: "high" as Priority },
          { re: /(^|\s)(important|!2)(?=\s|$)/i, priority: "medium" as Priority },
          { re: /(^|\s)(low\s+priority|someday|!3|!4)(?=\s|$)/i, priority: "low" as Priority },
        ]
      : []),
    ...(allowsDanish(mode)
      ? [
          { re: /(^|\s)!?(haster|akut|!!|!1)(?=\s|$)/i, priority: "high" as Priority },
          { re: /(^|\s)(vigtig|vigtigt|!2)(?=\s|$)/i, priority: "medium" as Priority },
          { re: /(^|\s)(lav\s+prioritet|en\s+dag|!3|!4)(?=\s|$)/i, priority: "low" as Priority },
        ]
      : []),
  ];

  for (const { re, priority } of patterns) {
    const m = input.match(re);
    if (m) return { priority, consumed: m[0] };
  }

  return null;
}

// ── Tags ────────────────────────────────────────────────────────

export function parseTags(
  input: string,
  existingTags: Tag[],
): { matchedTags: Tag[]; newTagNames: string[]; consumed: string[] } {
  const matches = [...input.matchAll(/@([\w-]+)/gi)];
  const matchedTags: Tag[] = [];
  const newTagNames: string[] = [];
  const consumed: string[] = [];

  for (const match of matches) {
    const name = match[1].toLowerCase();
    const existing = existingTags.find((t) => t.name.toLowerCase() === name);
    if (existing) {
      matchedTags.push(existing);
    } else {
      newTagNames.push(match[1]);
    }
    consumed.push(match[0]);
  }

  return { matchedTags, newTagNames, consumed };
}

// ── Project ─────────────────────────────────────────────────────

export function parseProject(
  input: string,
  projects: Project[],
): {
  project: Project | null;
  suggestedName: string | null;
  consumed: string;
  confidence: number;
} {
  // Support project names with spaces, numbers, and Danish chars (#Projekt 2, #Mit Projekt).
  // Capture from # up to the next metadata trigger or end-of-string, then progressively
  // shorten by one word at a time until we find a matching project — this prevents
  // "Buy milk #Jot fix bug" from consuming "Jot fix bug" as the project name.
  const hashMatch = input.match(
    /#([\w\sæøåÆØÅ\d-]+?)(?=\s[@!]|\s(?:due|at|kl|i\s(?:dag|morgen|overmorgen)|næste|every|hver)|$)/i,
  );
  if (hashMatch) {
    const words = hashMatch[1].trim().split(/\s+/);
    // Pass 1: exact match only (longest first)
    for (let len = words.length; len >= 1; len--) {
      const name = words.slice(0, len).join(" ");
      const consumed = "#" + words.slice(0, len).join(" ");
      const exact = projects.find(
        (p) => p.name.toLowerCase() === name.toLowerCase(),
      );
      if (exact)
        return { project: exact, suggestedName: null, consumed, confidence: 1 };
    }
    // Pass 2: fuzzy match (longest first)
    for (let len = words.length; len >= 1; len--) {
      const name = words.slice(0, len).join(" ");
      const consumed = "#" + words.slice(0, len).join(" ");
      const best = fuzzyBestMatch(name, projects);
      if (best && best.score > 0.4)
        return { project: best.project, suggestedName: null, consumed, confidence: best.score };
    }
    // Nothing matched — suggest the single word after #
    const single = words[0];
    return { project: null, suggestedName: single, consumed: "#" + single, confidence: 0 };
  }

  let m = input.match(
    /\bfor\s+(?:project\s+)?([\w\s-]+?)(?=\s+(?:due|at|@|!|\btag\b)|$)/i,
  );
  if (m) {
    const name = m[1].trim().toLowerCase();
    const best = fuzzyBestMatch(name, projects);
    if (best && best.score > 0.5) {
      return {
        project: best.project,
        suggestedName: null,
        consumed: m[0],
        confidence: best.score,
      };
    }
    return {
      project: null,
      suggestedName: m[1].trim(),
      consumed: m[0],
      confidence: 0,
    };
  }

  const words = input
    .toLowerCase()
    .replace(/@[\w-]+/g, "")
    .split(/\s+/);
  for (let len = 3; len >= 1; len--) {
    for (let i = 0; i <= words.length - len; i++) {
      const phrase = words.slice(i, i + len).join(" ");
      const best = fuzzyBestMatch(phrase, projects);
      if (best && best.score > 0.75) {
        return {
          project: best.project,
          suggestedName: null,
          consumed: "",
          confidence: best.score * 0.8,
        };
      }
    }
  }

  return { project: null, suggestedName: null, consumed: "", confidence: 0 };
}

function fuzzyBestMatch(
  query: string,
  projects: Project[],
): { project: Project; score: number } | null {
  if (projects.length === 0) return null;
  let best: { project: Project; score: number } | null = null;
  for (const p of projects) {
    const score = trigramSimilarity(query, p.name.toLowerCase());
    if (!best || score > best.score) best = { project: p, score };
  }
  return best;
}

// ── Main parser ─────────────────────────────────────────────────

export function parseInput(
  raw: string,
  projects: Project[],
  _tags: Tag[],
  options: ParseOptions = {},
): ParsedInput {
  const mode = options.languageMode ?? "auto";
  let working = raw.trim();

  // Recurrence runs first so "every monday" isn't consumed as a bare weekday date.
  const recResult = parseRecurrence(working, options);
  let recurrenceRule: string | null = null;
  if (recResult) {
    recurrenceRule = recResult.rule;
    working = working.replace(new RegExp(escapeRegex(recResult.consumed), "i"), " ");
  }

  const dateResult = parseDate(working, options);
  let dueDate: string | null = null;
  let dueTime: string | null = null;
  if (dateResult) {
    dueDate = dateResult.date;
    dueTime = dateResult.time;
    working = working.replace(new RegExp(escapeRegex(dateResult.consumed), "i"), " ");
  }

  // Extract a time that appears anywhere in the string (e.g. "at 12am today",
  // "at klokken 14" with no date, or any other position before/after the date).
  if (!dueTime) {
    const timeRe = new RegExp(
      `(?:^|\\s)${timePrefixPattern(mode)}\\s+((?:\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?|${literalTimePattern(mode)})(?=\\s|$)`,
      "i",
    );
    const tm = working.match(timeRe);
    if (tm) {
      const literalTime = parseLiteralTime(tm[1]);
      if (literalTime) {
        dueTime = literalTime;
      } else {
        let h = parseInt(tm[1]);
        const min = tm[2] ? parseInt(tm[2]) : 0;
        const ampm = tm[3]?.toLowerCase();
        if (ampm === "pm" && h < 12) h += 12;
        if (ampm === "am" && h === 12) h = 0;
        dueTime = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
      }
      working = working.replace(new RegExp(escapeRegex(tm[0]), "i"), " ");
    }
  }

  const priResult = parsePriority(working, options);
  let priority: Priority = "none";
  if (priResult) {
    priority = priResult.priority;
    // Trailing ! — slice from the end rather than replace (avoids mid-string collisions)
    if (/^\s*!+\s*$/.test(priResult.consumed)) {
      working = working.slice(0, working.length - priResult.consumed.length);
    } else {
      working = working.replace(
        new RegExp(escapeRegex(priResult.consumed), "i"),
        " ",
      );
    }
  }

  // @ is now the explicit date prefix — tag parsing is a hidden server-side
  // feature and no longer runs in the main input pipeline.
  const tagResult = { matchedTags: [] as Tag[], newTagNames: [] as string[], consumed: [] as string[] };

  const projResult = parseProject(working, projects);
  const project: Project | null = projResult.project;
  // Always remove hash-syntax consumed (#Project). For "for X" syntax, only
  // remove if a project was actually matched — otherwise "for interview" etc.
  // would be stripped even when the fuzzy score is below threshold.
  if (projResult.consumed && (projResult.project || projResult.consumed.startsWith("#"))) {
    working = working.replace(projResult.consumed, " ");
  }

  // Strip orphaned prepositions left behind after metadata extraction.
  // e.g. "Buy milk for tomorrow" → after removing "tomorrow" → "Buy milk for" → "Buy milk"
  working = working
    .replace(/\s+\b(for|due|on|at|til|inden|på)\s*$/i, "")   // trailing
    .replace(/^\s*\b(for|due|on|at|til|inden|på)\b\s+/i, ""); // leading

  const title = working
    .replace(/\s+/g, " ")
    .replace(/^\s*[,;:]+\s*/, "")
    .replace(/\s*[,;:]+\s*$/, "")
    .trim();

  return {
    title: title || raw.trim(),
    project,
    suggestedProjectName: projResult.suggestedName,
    dueDate,
    dueTime,
    priority,
    tags: tagResult.matchedTags,
    suggestedTagNames: tagResult.newTagNames,
    recurrenceRule,
    projectMatchConfidence: projResult.confidence,
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
