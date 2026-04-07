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

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

interface DateResult {
  date: string;
  time: string | null;
  consumed: string;
}

export function parseDate(input: string): DateResult | null {
  const lower = input.toLowerCase();
  const today = new Date();

  function parseTimeSuffix(after: string): {
    time: string | null;
    consumed: string;
  } {
    const m = after.match(/^\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (!m) return { time: null, consumed: "" };
    let h = parseInt(m[1]);
    const min = m[2] ? parseInt(m[2]) : 0;
    const ampm = m[3]?.toLowerCase();
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    const time = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    return { time, consumed: m[0] };
  }

  let m = lower.match(/(^|\s)(today)(\b)/);
  if (m) {
    const rest = input.slice(m.index! + m[0].length);
    const { time, consumed } = parseTimeSuffix(rest);
    return { date: toISODate(today), time, consumed: m[0] + consumed };
  }

  m = lower.match(/(^|\s)(tomorrow)(\b)/);
  if (m) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    const rest = input.slice(m.index! + m[0].length);
    const { time, consumed } = parseTimeSuffix(rest);
    return { date: toISODate(d), time, consumed: m[0] + consumed };
  }

  m = lower.match(/(^|\s)(next week)(\b)/);
  if (m) {
    const d = new Date(today);
    d.setDate(d.getDate() + 7);
    return { date: toISODate(d), time: null, consumed: m[0] };
  }

  m = lower.match(/(^|\s)(next month)(\b)/);
  if (m) {
    const d = new Date(today);
    d.setMonth(d.getMonth() + 1);
    return { date: toISODate(d), time: null, consumed: m[0] };
  }

  m = lower.match(/(^|\s)in\s+(\d+)\s+(day|days|week|weeks|month|months)/);
  if (m) {
    const n = parseInt(m[2]);
    const unit = m[3];
    const d = new Date(today);
    if (unit.startsWith("day")) d.setDate(d.getDate() + n);
    else if (unit.startsWith("week")) d.setDate(d.getDate() + n * 7);
    else d.setMonth(d.getMonth() + n);
    return { date: toISODate(d), time: null, consumed: m[0] };
  }

  const dayKeys = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length);
  for (const day of dayKeys) {
    const re = new RegExp(`(^|\\s)(${day})(\\b)`, "i");
    m = lower.match(re);
    if (m) {
      const d = nextWeekday(WEEKDAYS[day]);
      const rest = input.slice(m.index! + m[0].length);
      const { time, consumed } = parseTimeSuffix(rest);
      return { date: toISODate(d), time, consumed: m[0] + consumed };
    }
  }

  const monthKeys = Object.keys(MONTHS).sort((a, b) => b.length - a.length);
  for (const mon of monthKeys) {
    const re = new RegExp(`(^|\\s)(${mon})\\s+(\\d{1,2})(?:st|nd|rd|th)?`, "i");
    m = lower.match(re);
    if (m) {
      const d = new Date(today.getFullYear(), MONTHS[mon], parseInt(m[3]));
      if (d < today) d.setFullYear(d.getFullYear() + 1);
      return { date: toISODate(d), time: null, consumed: m[0] };
    }
    const re2 = new RegExp(
      `(^|\\s)(\\d{1,2})(?:st|nd|rd|th)?\\s+(${mon})`,
      "i",
    );
    m = lower.match(re2);
    if (m) {
      const d = new Date(today.getFullYear(), MONTHS[mon], parseInt(m[2]));
      if (d < today) d.setFullYear(d.getFullYear() + 1);
      return { date: toISODate(d), time: null, consumed: m[0] };
    }
  }

  m = lower.match(/(^|\s)due\s+(\w+)/);
  if (m) {
    const inner = parseDate(input.replace(/due\s+/i, ""));
    if (inner) return inner;
  }

  return null;
}

export function parseRecurrence(
  input: string,
): { rule: string; consumed: string } | null {
  const lower = input.toLowerCase();

  const patterns: Array<{ re: RegExp; rule: string }> = [
    { re: /every\s+day|daily/, rule: "FREQ=DAILY" },
    { re: /every\s+week|weekly/, rule: "FREQ=WEEKLY" },
    { re: /every\s+month|monthly/, rule: "FREQ=MONTHLY" },
    { re: /every\s+year|yearly|annually/, rule: "FREQ=YEARLY" },
    { re: /every\s+(\d+)\s+days/, rule: "" },
    { re: /every\s+(\d+)\s+weeks/, rule: "" },
    { re: /every\s+monday/, rule: "FREQ=WEEKLY;BYDAY=MO" },
    { re: /every\s+tuesday/, rule: "FREQ=WEEKLY;BYDAY=TU" },
    { re: /every\s+wednesday/, rule: "FREQ=WEEKLY;BYDAY=WE" },
    { re: /every\s+thursday/, rule: "FREQ=WEEKLY;BYDAY=TH" },
    { re: /every\s+friday/, rule: "FREQ=WEEKLY;BYDAY=FR" },
    { re: /every\s+saturday/, rule: "FREQ=WEEKLY;BYDAY=SA" },
    { re: /every\s+sunday/, rule: "FREQ=WEEKLY;BYDAY=SU" },
  ];

  for (const { re, rule } of patterns) {
    const m = lower.match(re);
    if (m) {
      if (rule === "" && m[1]) {
        const n = parseInt(m[1]);
        const unit = m[0].includes("days") ? "DAILY" : "WEEKLY";
        return { rule: `FREQ=${unit};INTERVAL=${n}`, consumed: m[0] };
      }
      return { rule, consumed: m[0] };
    }
  }

  return null;
}

type Priority = "high" | "medium" | "low" | "none";

export function parsePriority(
  input: string,
): { priority: Priority; consumed: string } | null {
  const patterns: Array<{ re: RegExp; priority: Priority }> = [
    { re: /\b(urgent|asap|critical|!!|!1)\b/i, priority: "high" },
    { re: /\b(important|!2|!)\b/i, priority: "medium" },
    { re: /\b(low\s+priority|someday|!3|!4)\b/i, priority: "low" },
  ];

  for (const { re, priority } of patterns) {
    const m = input.match(re);
    if (m) return { priority, consumed: m[0] };
  }

  return null;
}

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

export function parseProject(
  input: string,
  projects: Project[],
): {
  project: Project | null;
  suggestedName: string | null;
  consumed: string;
  confidence: number;
} {
  let m = input.match(/#([\w-]+)/i);
  if (m) {
    const name = m[1].toLowerCase();
    const exact = projects.find((p) => p.name.toLowerCase() === name);
    if (exact)
      return {
        project: exact,
        suggestedName: null,
        consumed: m[0],
        confidence: 1,
      };
    const best = fuzzyBestMatch(name, projects);
    if (best && best.score > 0.4) {
      return {
        project: best.project,
        suggestedName: null,
        consumed: m[0],
        confidence: best.score,
      };
    }
    return {
      project: null,
      suggestedName: m[1],
      consumed: m[0],
      confidence: 0,
    };
  }

  m = input.match(
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

export function parseInput(
  raw: string,
  projects: Project[],
  tags: Tag[],
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
    working = working.replace(new RegExp(recResult.consumed, "i"), " ");
  }

  const priResult = parsePriority(working);
  let priority: Priority = "none";
  if (priResult) {
    priority = priResult.priority;
    working = working.replace(
      new RegExp(escapeRegex(priResult.consumed), "i"),
      " ",
    );
  }

  const tagResult = parseTags(working, tags);
  for (const consumed of tagResult.consumed) {
    working = working.replace(consumed, " ");
  }

  const projResult = parseProject(working, projects);
  const project: Project | null = projResult.project;
  if (projResult.consumed) {
    working = working.replace(projResult.consumed, " ");
  }

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
