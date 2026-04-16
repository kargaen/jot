import type { ParsedInput, Project, Tag } from "../types";

function toISODate(d: Date): string {
  return d.toISOString().split("T")[0];
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
  // Danish additions (shared ones like januar/februar/april/august already overlap)
  marts: 2,
  maj: 4,
  juni: 5,
  juli: 6,
  okt: 9, oktober: 9,
};

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

interface DateResult {
  date: string;
  time: string | null;
  consumed: string;
}

// ── Time suffix: "at 14:00" / "kl 14" / "klokken 14:30" ────────
function parseTimeSuffix(after: string): {
  time: string | null;
  consumed: string;
} {
  const m = after.match(
    /^\s+(?:at|kl\.?|klokken)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i,
  );
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
): DateResult {
  const rest = input.slice(match.index! + match[0].length);
  const { time, consumed } = parseTimeSuffix(rest);
  return { date: toISODate(d), time, consumed: match[0] + consumed };
}

// We use (?=\\s|$) instead of \\b because \\b breaks on Danish chars (ø, å).
// Weekday/month keys sorted longest-first so "thursday" matches before "thu".
const sortedDayKeys = Object.keys(WEEKDAYS).sort(
  (a, b) => b.length - a.length,
);
const sortedMonthKeys = Object.keys(MONTHS).sort(
  (a, b) => b.length - a.length,
);
const sortedBydayKeys = Object.keys(WEEKDAY_BYDAY).sort(
  (a, b) => b.length - a.length,
);

export function parseDate(input: string): DateResult | null {
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
    const inner = parseDate(candidate);
    if (inner) {
      const rest = input.slice((m.index ?? 0) + m[0].length);
      const { time, consumed: timeSuffix } = parseTimeSuffix(rest);
      return { date: inner.date, time, consumed: m[0] + timeSuffix };
    }
  }

  // ── 1. Relative dates (EN + DA) ───────────────────────────────

  // today / i dag
  m = lower.match(/(^|\s)(today|i\s+dag)(?=\s|$)/);
  if (m) return withTime(input, m, today);

  // tomorrow / i morgen
  m = lower.match(/(^|\s)(tomorrow|i\s+morgen)(?=\s|$)/);
  if (m) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return withTime(input, m, d);
  }

  // day after tomorrow / i overmorgen / overmorgen
  m = lower.match(
    /(^|\s)((?:the\s+)?day\s+after\s+tomorrow|i\s+overmorgen|overmorgen)(?=\s|$)/,
  );
  if (m) {
    const d = new Date(today);
    d.setDate(d.getDate() + 2);
    return withTime(input, m, d);
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
    if (/^(minutes?|minutter?)$/.test(unit)) d.setMinutes(d.getMinutes() + n);
    else if (/^(hours?|timer?)$/.test(unit)) d.setHours(d.getHours() + n);
    else if (/^(days?|dage?)$/.test(unit)) d.setDate(d.getDate() + n);
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
      const d = nextWeekday(WEEKDAYS[day]);
      return withTime(input, m, d);
    }
  }

  // ── 5. Bare weekdays ──────────────────────────────────────────

  for (const day of sortedDayKeys) {
    const re = new RegExp(`(^|\\s)(${day})(?=\\s|$)`, "i");
    m = lower.match(re);
    if (m) {
      const d = nextWeekday(WEEKDAYS[day]);
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
    // "15 jan" / "15th january" / "15. januar"
    const re2 = new RegExp(
      `(^|\\s)(\\d{1,2})(?:st|nd|rd|th)?\\.?\\s+(${mon})(?=\\s|$)`,
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
): { rule: string; consumed: string } | null {
  const lower = input.toLowerCase();

  // Fixed patterns (EN + DA)
  const patterns: Array<{ re: RegExp; rule: string }> = [
    { re: /every\s+day|daily|hver\s+dag|dagligt/, rule: "FREQ=DAILY" },
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

  // every/hver [weekday]
  for (const day of sortedBydayKeys) {
    const re = new RegExp(`(?:every|hver)\\s+(${day})(?=\\s|$)`, "i");
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
): { priority: Priority; consumed: string } | null {
  // Trailing ! (one or more) = high priority — check first so it's consumed
  // and doesn't end up in the task title.
  const trailingBang = input.match(/\s*!+\s*$/);
  if (trailingBang) {
    return { priority: "high", consumed: trailingBang[0] };
  }

  const patterns: Array<{ re: RegExp; priority: Priority }> = [
    {
      re: /\b(urgent|asap|critical|haster|akut|!!|!1)\b/i,
      priority: "high",
    },
    { re: /\b(important|vigtig|vigtigt|!2)\b/i, priority: "medium" },
    {
      re: /\b(low\s+priority|lav\s+prioritet|someday|en\s+dag|!3|!4)\b/i,
      priority: "low",
    },
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
    for (let len = words.length; len >= 1; len--) {
      const name = words.slice(0, len).join(" ");
      const consumed = "#" + words.slice(0, len).join(" ");
      const exact = projects.find(
        (p) => p.name.toLowerCase() === name.toLowerCase(),
      );
      if (exact)
        return { project: exact, suggestedName: null, consumed, confidence: 1 };
      const best = fuzzyBestMatch(name, projects);
      if (best && best.score > 0.4)
        return { project: best.project, suggestedName: null, consumed, confidence: best.score };
    }
    // Nothing matched — suggest the single word after #
    const single = words[0];
    return { project: null, suggestedName: single, consumed: "#" + single, confidence: 0 };
  }

  let m = input.match(
    /\bfor\s+(?:project\s+)?([\w\s-]+?)(?=\s+(due|at|@|!|\btag\b|$))/i,
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
): ParsedInput {
  let working = raw.trim();

  const dateResult = parseDate(working);
  let dueDate: string | null = null;
  let dueTime: string | null = null;
  if (dateResult) {
    dueDate = dateResult.date;
    dueTime = dateResult.time;
    working = working.replace(dateResult.consumed, " ");
  }

  const recResult = parseRecurrence(working);
  let recurrenceRule: string | null = null;
  if (recResult) {
    recurrenceRule = recResult.rule;
    working = working.replace(new RegExp(escapeRegex(recResult.consumed), "i"), " ");
  }

  const priResult = parsePriority(working);
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
  if (projResult.consumed) {
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
