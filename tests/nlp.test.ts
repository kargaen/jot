/**
 * NLP module test suite.
 * Run: TZ=UTC npx tsx tests/nlp.test.ts
 *
 * Frozen date: 2026-04-15 (Wednesday) 12:00 UTC
 * TZ=UTC is required so new Date(year, month, day) constructions are timezone-safe.
 *
 * Failing tests document bugs or unimplemented features — do not delete them.
 */
import { parseInput } from "../src/lib/nlp";
import type { Project, Tag } from "../src/types";

// ─── Date Mock ───────────────────────────────────────────────────────────────
// Freezes "now" so all relative-date math is deterministic.
// Must be set before any parseInput call (nlp.ts has no top-level Date calls).
const RealDate = Date;
const MOCK_NOW = new RealDate("2026-04-15T12:00:00Z"); // Wednesday

(globalThis as any).Date = class MockDate extends RealDate {
  constructor(...args: any[]) {
    if (args.length === 0) {
      super(MOCK_NOW.getTime());
    } else if (args.length === 1) {
      super(args[0]);
    } else {
      // Multi-arg (e.g. new Date(year, month, day)) — used in month/day and weekday calcs.
      // @ts-ignore – TS dislikes spread on Date super, but tsx/esbuild is fine.
      super(...args);
    }
  }
  static now()  { return MOCK_NOW.getTime(); }
  static parse  = RealDate.parse.bind(RealDate);
  static UTC    = RealDate.UTC.bind(RealDate);
};

// ─── Reference dates (all UTC, 2026-04-15 = Wednesday) ───────────────────────
// Weekdays from Wed Apr 15:  Mon=Apr20  Tue=Apr21  Wed=Apr22  Thu=Apr16  Fri=Apr17  Sat=Apr18  Sun=Apr19
// next week   = Apr 22   next month = May 15   next year = Apr 15 2027
// end of week = Apr 17 (Friday)   end of month = Apr 30

// ─── Mock Data ───────────────────────────────────────────────────────────────
const allProjects: Project[] = [
  { id: "p1", name: "Work"        } as Project,
  { id: "p2", name: "Personal"    } as Project,
  { id: "p3", name: "Jot"         } as Project,
  { id: "p4", name: "Jot Project" } as Project,
  { id: "p5", name: "Mit Projekt" } as Project,
  { id: "p6", name: "Shopping"    } as Project,
];

const allTags: Tag[] = [
  { id: "t1", name: "home"    } as Tag,
  { id: "t2", name: "urgent"  } as Tag,
  { id: "t3", name: "work"    } as Tag,
  { id: "t4", name: "family"  } as Tag,
  { id: "t5", name: "backend" } as Tag,
  { id: "t6", name: "boss"    } as Tag,
];

// ─── Test structure ──────────────────────────────────────────────────────────
interface Expect {
  title?:            string;
  dueDate?:          string | null;
  dueTime?:          string | null;
  priority?:         "none" | "low" | "medium" | "high";
  projectName?:      string | null;
  suggestedProject?: string | null;
  tagNames?:         string[];   // matched existing tags, sorted
  suggestedTags?:    string[];   // new (unknown) tag names, sorted
  recurrence?:       string | null;
}

interface TestCase { input: string; expected: Expect; note?: string; }
interface TestGroup { name: string; cases: TestCase[]; }

// ─── Helper ───────────────────────────────────────────────────────────────────
function sorted(a: string[]) { return [...a].sort(); }

// ─── Test Groups ─────────────────────────────────────────────────────────────

const groups: TestGroup[] = [

  // ── 1. English relative dates ─────────────────────────────────────────────
  {
    name: "English relative dates",
    cases: [
      { input: "Buy milk today",              expected: { title: "Buy milk",   dueDate: "2026-04-15" } },
      { input: "Call doctor tomorrow",        expected: { title: "Call doctor", dueDate: "2026-04-16" } },
      { input: "Call doctor tomorrow at 10:30", expected: { title: "Call doctor", dueDate: "2026-04-16", dueTime: "10:30" } },
      // BUG: "tomorrow" is matched before "day after tomorrow" — date is wrong
      { input: "Meeting day after tomorrow",  expected: { title: "Meeting",    dueDate: "2026-04-17" },
        note: "BUG: 'tomorrow' pattern matches before 'day after tomorrow'" },
      { input: "Review docs next week",       expected: { title: "Review docs", dueDate: "2026-04-22" } },
      { input: "Plan vacation next month",    expected: { title: "Plan vacation", dueDate: "2026-05-15" } },
      { input: "Celebrate next year",         expected: { title: "Celebrate",  dueDate: "2027-04-15" } },
      { input: "End of week report",          expected: { title: "report",     dueDate: "2026-04-17" } },
      { input: "End of month budget",         expected: { title: "budget",     dueDate: "2026-04-30" } },
    ],
  },

  // ── 2. Danish relative dates ──────────────────────────────────────────────
  {
    name: "Danish relative dates",
    cases: [
      { input: "Aflever pakke i dag",            expected: { title: "Aflever pakke",  dueDate: "2026-04-15" } },
      { input: "Tandlæge i morgen",              expected: { title: "Tandlæge",       dueDate: "2026-04-16" } },
      { input: "Tandlæge i morgen kl 9:15",      expected: { title: "Tandlæge",       dueDate: "2026-04-16", dueTime: "09:15" } },
      { input: "Fodbold i overmorgen",           expected: { title: "Fodbold",        dueDate: "2026-04-17" } },
      { input: "Fodbold overmorgen",             expected: { title: "Fodbold",        dueDate: "2026-04-17" } },
      { input: "Frisør næste uge",               expected: { title: "Frisør",         dueDate: "2026-04-22" } },
      { input: "Frokost næste måned",            expected: { title: "Frokost",        dueDate: "2026-05-15" } },
      { input: "Fest næste år",                  expected: { title: "Fest",           dueDate: "2027-04-15" } },
      { input: "Deadline slutningen af måneden", expected: { title: "Deadline",       dueDate: "2026-04-30" } },
      { input: "Slutningen af ugen rapport",     expected: { title: "rapport",        dueDate: "2026-04-17" } },
    ],
  },

  // ── 3. "In N units" — English ─────────────────────────────────────────────
  {
    name: "In N units — English",
    cases: [
      { input: "Buy groceries in 3 days",  expected: { title: "Buy groceries", dueDate: "2026-04-18" } },
      { input: "Meeting in 2 weeks",       expected: { title: "Meeting",       dueDate: "2026-04-29" } },
      { input: "Review in 1 month",        expected: { title: "Review",        dueDate: "2026-05-15" } },
      { input: "Plan in 3 months",         expected: { title: "Plan",          dueDate: "2026-07-15" } },
      { input: "Birthday in 1 year",       expected: { title: "Birthday",      dueDate: "2027-04-15" } },
      { input: "Reminder in 2 hours",      expected: { title: "Reminder",      dueDate: "2026-04-15" } },
      { input: "Alarm in 30 minutes",      expected: { title: "Alarm",         dueDate: "2026-04-15" } },
    ],
  },

  // ── 4. "Om N enheder" — Danish ────────────────────────────────────────────
  {
    name: "Om N enheder — Danish",
    cases: [
      { input: "Oplæg om 3 dage",    expected: { title: "Oplæg",   dueDate: "2026-04-18" } },
      { input: "Ferie om 2 uger",    expected: { title: "Ferie",   dueDate: "2026-04-29" } },
      { input: "Tjek om 1 måned",    expected: { title: "Tjek",    dueDate: "2026-05-15" } },
      { input: "Møde om 3 måneder",  expected: { title: "Møde",    dueDate: "2026-07-15" } },
      { input: "Fejre om 1 år",      expected: { title: "Fejre",   dueDate: "2027-04-15" } },
      { input: "Påmind om 30 minutter", expected: { title: "Påmind", dueDate: "2026-04-15" } },
    ],
  },

  // ── 5. English weekdays ───────────────────────────────────────────────────
  {
    name: "English weekdays",
    cases: [
      { input: "Gym monday",          expected: { title: "Gym",     dueDate: "2026-04-20" } },
      { input: "Doctor thursday",     expected: { title: "Doctor",  dueDate: "2026-04-16" } },
      { input: "Meeting friday",      expected: { title: "Meeting", dueDate: "2026-04-17" } },
      { input: "Party saturday",      expected: { title: "Party",   dueDate: "2026-04-18" } },
      { input: "Church sunday",       expected: { title: "Church",  dueDate: "2026-04-19" } },
      { input: "Gym on monday",       expected: { title: "Gym",     dueDate: "2026-04-20" } },
      { input: "Meeting next tuesday", expected: { title: "Meeting", dueDate: "2026-04-21" } },
      { input: "Exam next wednesday", expected: { title: "Exam",    dueDate: "2026-04-22" } },
      // Asking for "wednesday" bare — today IS Wednesday, so nextWeekday returns +7
      { input: "Deadline wednesday",  expected: { title: "Deadline", dueDate: "2026-04-22" } },
    ],
  },

  // ── 6. Danish weekdays ────────────────────────────────────────────────────
  {
    name: "Danish weekdays",
    cases: [
      { input: "Gym mandag",           expected: { title: "Gym",     dueDate: "2026-04-20" } },
      { input: "Møde torsdag",         expected: { title: "Møde",    dueDate: "2026-04-16" } },
      { input: "Fest lørdag",          expected: { title: "Fest",    dueDate: "2026-04-18" } },
      { input: "Gym på mandag",        expected: { title: "Gym",     dueDate: "2026-04-20" } },
      { input: "Meeting på fredag",    expected: { title: "Meeting", dueDate: "2026-04-17" } },
      { input: "Frokost næste tirsdag", expected: { title: "Frokost", dueDate: "2026-04-21" } },
      { input: "Løb næste onsdag",     expected: { title: "Løb",     dueDate: "2026-04-22" } },
    ],
  },

  // ── 7. Month + day ────────────────────────────────────────────────────────
  {
    name: "Month + day",
    cases: [
      // Past months → next year
      { input: "Doctor appointment jan 15",  expected: { title: "Doctor appointment", dueDate: "2027-01-15" } },
      { input: "Birthday january 1st",       expected: { title: "Birthday",          dueDate: "2027-01-01" } },
      { input: "15. januar eksamen",         expected: { title: "eksamen",           dueDate: "2027-01-15" } },
      // Future months → this year
      { input: "Christmas dec 25",           expected: { title: "Christmas",         dueDate: "2026-12-25" } },
      { input: "Party 25th december",        expected: { title: "Party",             dueDate: "2026-12-25" } },
      { input: "25. december fest",          expected: { title: "fest",              dueDate: "2026-12-25" } },
      { input: "Pay taxes april 30",         expected: { title: "Pay taxes",         dueDate: "2026-04-30" } },
      { input: "1. maj fest",                expected: { title: "fest",              dueDate: "2026-05-01" } },
      { input: "Eksamen 15. juni",           expected: { title: "Eksamen",           dueDate: "2026-06-15" } },
      { input: "October 31 party",           expected: { title: "party",             dueDate: "2026-10-31" } },
      // BUG: "d. X. month" — step 6 (month+day) matches before step 7 (den/d.), leaving "d." in title
      { input: "Fødselsdag d. 25. maj",      expected: { title: "Fødselsdag",        dueDate: "2026-05-25" },
        note: "BUG: 'd.' prefix not consumed when month name follows the day number" },
      { input: "Møde den 2. juni",           expected: { title: "Møde",              dueDate: "2026-06-02" },
        note: "BUG: 'den' not consumed when month name follows" },
      // BUG: "d. X. month" navigation — "Fly til London d. 20. maj" leaves "d." in title
      { input: "Fly til London d. 20. maj",  expected: { title: "Fly til London",    dueDate: "2026-05-20" },
        note: "BUG: 'd.' prefix not consumed when month follows" },
    ],
  },

  // ── 8. Danish ordinal "den/d. X" ─────────────────────────────────────────
  {
    name: "Danish ordinal den/d. X",
    cases: [
      // Day > today (15) → this month
      { input: "Møde den 20.",       expected: { title: "Møde",       dueDate: "2026-04-20" } },
      { input: "Eksamen den 30.",    expected: { title: "Eksamen",    dueDate: "2026-04-30" } },
      // Day <= today → next month
      { input: "Betaling d. 5",      expected: { title: "Betaling",   dueDate: "2026-05-05" } },
      { input: "Tandlæge den 1.",    expected: { title: "Tandlæge",   dueDate: "2026-05-01" } },
      // Today's day number → next month (d <= today is true because local midnight < noon)
      { input: "Begivenhed d. 15",   expected: { title: "Begivenhed", dueDate: "2026-05-15" } },
    ],
  },

  // ── 9. ISO date ───────────────────────────────────────────────────────────
  {
    name: "ISO date",
    cases: [
      { input: "Deadline 2026-12-31", expected: { title: "Deadline", dueDate: "2026-12-31" } },
      { input: "Event 2027-01-15",    expected: { title: "Event",    dueDate: "2027-01-15" } },
    ],
  },

  // ── 10. Time parsing ──────────────────────────────────────────────────────
  {
    name: "Time parsing",
    cases: [
      { input: "Meeting today at 14:00",        expected: { title: "Meeting",    dueDate: "2026-04-15", dueTime: "14:00" } },
      { input: "Call doctor tomorrow at 2pm",   expected: { title: "Call doctor", dueDate: "2026-04-16", dueTime: "14:00" } },
      { input: "Lunch friday at 12:30",         expected: { title: "Lunch",      dueDate: "2026-04-17", dueTime: "12:30" } },
      { input: "Meeting tomorrow at 9am",       expected: { title: "Meeting",    dueDate: "2026-04-16", dueTime: "09:00" } },
      { input: "Midnight alarm at 12am today",  expected: { title: "Midnight alarm", dueDate: "2026-04-15", dueTime: "00:00" } },
      { input: "Møde i dag kl 10",             expected: { title: "Møde",       dueDate: "2026-04-15", dueTime: "10:00" } },
      { input: "Tandlæge i morgen kl. 9",      expected: { title: "Tandlæge",   dueDate: "2026-04-16", dueTime: "09:00" } },
      { input: "Møde i dag klokken 14:30",     expected: { title: "Møde",       dueDate: "2026-04-15", dueTime: "14:30" } },
      { input: "Morning standup monday at 9am", expected: { title: "Morning standup", dueDate: "2026-04-20", dueTime: "09:00" } },
      // BUG: time-only (no date anchor) is not parsed — parseTimeSuffix only runs after a date match
      { input: "Call boss at klokken 14",       expected: { title: "Call boss",  dueTime: "14:00" },
        note: "BUG: time without a date is not parsed — parseTimeSuffix requires a preceding date match" },
    ],
  },

  // ── 11. Priority — English ────────────────────────────────────────────────
  {
    name: "Priority — English",
    cases: [
      // Trailing ! (one or more) → high
      { input: "Ring til læge!",      expected: { title: "Ring til læge", priority: "high" } },
      { input: "Fix bug!",            expected: { title: "Fix bug",       priority: "high" } },
      { input: "Fix bug!!",           expected: { title: "Fix bug",       priority: "high" } },
      { input: "Fix bug !!",          expected: { title: "Fix bug",       priority: "high" } },
      { input: "Fix bug !!!",         expected: { title: "Fix bug",       priority: "high" } },
      // Keyword priority
      { input: "Fix critical bug",    expected: { title: "Fix bug",       priority: "high" } },
      { input: "Fix bug asap",        expected: { title: "Fix bug",       priority: "high" } },
      { input: "Important email",     expected: { title: "email",         priority: "medium" } },
      { input: "Buy milk someday",    expected: { title: "Buy milk",      priority: "low" } },
      // BUG: "!urgent" leaves "!" in the title because only "urgent" is consumed
      { input: "Fix bug !urgent",     expected: { title: "Fix bug",       priority: "high" },
        note: "BUG: only 'urgent' consumed, '!' stays in title" },
    ],
  },

  // ── 12. Priority — Danish ─────────────────────────────────────────────────
  {
    name: "Priority — Danish",
    cases: [
      { input: "Akut møde med kunden", expected: { title: "møde med kunden", priority: "high" } },
      { input: "Haster fix issue",     expected: { title: "fix issue",       priority: "high" } },
      { input: "Vigtig mail",          expected: { title: "mail",            priority: "medium" } },
      { input: "Lav prioritet backup", expected: { title: "backup",          priority: "low" } },
      { input: "En dag rydde op",      expected: { title: "rydde op",        priority: "low" } },
      { input: "Vigtigt møde i morgen", expected: { title: "møde",           priority: "medium", dueDate: "2026-04-16" } },
    ],
  },

  // ── 13. Priority codes — !1 / !2 / !3 ───────────────────────────────────
  {
    name: "Priority codes",
    cases: [
      // BUG: !1/!2/!3 require \b word boundary before ! which doesn't fire (! is not \w)
      { input: "Fix bug !1", expected: { title: "Fix bug", priority: "high" },
        note: "BUG: \\b before '!' does not fire — !1 not matched" },
      { input: "Fix bug !2", expected: { title: "Fix bug", priority: "medium" },
        note: "BUG: \\b before '!' does not fire — !2 not matched" },
      { input: "Fix bug !3", expected: { title: "Fix bug", priority: "low" },
        note: "BUG: \\b before '!' does not fire — !3 not matched" },
      // !! works because trailing-bang regex captures it
      { input: "Fix bug !!!", expected: { title: "Fix bug", priority: "high" } },
    ],
  },

  // ── 14. @ date prefix ────────────────────────────────────────────────────
  // @ explicitly marks the following word(s) as a date — "at monday", "at tomorrow".
  // Replaces the old @tag syntax. Tags remain a server-side feature only.
  {
    name: "@ date prefix",
    cases: [
      // Basic: single keyword
      { input: "Gym @monday",              expected: { title: "Gym",       dueDate: "2026-04-20" } },
      { input: "Gym @mandag",              expected: { title: "Gym",       dueDate: "2026-04-20" } },
      { input: "Call mom @tomorrow",       expected: { title: "Call mom",  dueDate: "2026-04-16" } },
      { input: "Call mom @i-morgen",       expected: { title: "Call mom",  dueDate: "2026-04-16" } },
      { input: "Workout @friday",          expected: { title: "Workout",   dueDate: "2026-04-17" } },
      { input: "Workout @fredag",          expected: { title: "Workout",   dueDate: "2026-04-17" } },
      { input: "Party @saturday",          expected: { title: "Party",     dueDate: "2026-04-18" } },
      { input: "Task @today",              expected: { title: "Task",      dueDate: "2026-04-15" } },
      // Multi-word via hyphen
      { input: "Plan @next-week",          expected: { title: "Plan",      dueDate: "2026-04-22" } },
      { input: "Plan @næste-uge",          expected: { title: "Plan",      dueDate: "2026-04-22" } },
      // With time suffix after the @date
      { input: "Meeting @friday kl 10",    expected: { title: "Meeting",   dueDate: "2026-04-17", dueTime: "10:00" } },
      { input: "Standup @monday at 9am",   expected: { title: "Standup",   dueDate: "2026-04-20", dueTime: "09:00" } },
      // @ at start of input
      { input: "@tomorrow fix bug",        expected: { title: "fix bug",   dueDate: "2026-04-16" } },
      // Non-date word after @ → @ stays in title (no date match)
      { input: "Gym @home",                expected: { title: "Gym @home", dueDate: null } },
      // @ alone or followed by space → no match, stays in title
      { input: "Task @ sign",              expected: { title: "Task @ sign", dueDate: null } },
      // Email address: @ inside word — only fires if @ is preceded by word boundary
      { input: "Contact support@jot.app",  expected: { title: "Contact support@jot.app", dueDate: null } },
    ],
  },

  // ── 15. Projects — exact match ────────────────────────────────────────────
  {
    name: "Projects — exact match",
    cases: [
      { input: "fix bug #Jot",                 expected: { title: "fix bug",              projectName: "Jot" } },
      { input: "fix bug #jot",                 expected: { title: "fix bug",              projectName: "Jot" } },
      { input: "#Work prepare slide",          expected: { title: "prepare slide",        projectName: "Work" } },
      { input: "#Personal tax return",         expected: { title: "tax return",           projectName: "Personal" } },
      { input: "#Shopping buy groceries",      expected: { title: "buy groceries",        projectName: "Shopping" } },
      { input: "#Mit Projekt implement feature", expected: { title: "implement feature",  projectName: "Mit Projekt" } },
      { input: "#Jot Project design new UI",   expected: { title: "design new UI",        projectName: "Jot Project" } },
    ],
  },

  // ── 16. Projects — progressive shortening ────────────────────────────────
  {
    name: "Projects — progressive shortening",
    cases: [
      // Disambiguates task words from project name
      { input: "#Mit Projekt fix bug",      expected: { title: "fix bug",     projectName: "Mit Projekt" } },
      { input: "#Jot deploy hotfix",        expected: { title: "deploy hotfix", projectName: "Jot" } },
      // "Jot 2" fuzzy-matches "Jot" (trigram score > 0.4)
      { input: "Fix #Jot 2 ship release",   expected: { title: "Fix ship release", projectName: "Jot" } },
      // Unknown project → suggested name (single word after #)
      { input: "#NewProject123 new habit",  expected: { title: "new habit",   suggestedProject: "NewProject123" } },
      // # alone — no match, no suggestion
      { input: "Meeting #",                 expected: { title: "Meeting #",   projectName: null, suggestedProject: null } },
    ],
  },

  // ── 17. Projects — "for X" fuzzy ─────────────────────────────────────────
  {
    name: "Projects — for X fuzzy",
    cases: [
      // BUG: implicit fuzzy match returns consumed="" — project name stays in title
      { input: "Write blog post for Work",  expected: { title: "Write blog post", projectName: "Work" },
        note: "BUG: implicit fuzzy has consumed='' — project name not removed from title" },
      // BUG: "for interview" is consumed as a project suggestion even though interview ≈ nothing
      { input: "Prepare for interview next week", expected: { title: "Prepare for interview", dueDate: "2026-04-22" },
        note: "BUG: 'for interview' consumed as project suggestion (trailing space triggers lookahead)" },
    ],
  },

  // ── 18. Recurrence — English ─────────────────────────────────────────────
  {
    name: "Recurrence — English",
    cases: [
      { input: "Gym every day",          expected: { title: "Gym",     recurrence: "FREQ=DAILY" } },
      { input: "Walk dog daily",         expected: { title: "Walk dog", recurrence: "FREQ=DAILY" } },
      { input: "Review weekly",          expected: { title: "Review",   recurrence: "FREQ=WEEKLY" } },
      { input: "Rent every month",       expected: { title: "Rent",     recurrence: "FREQ=MONTHLY" } },
      { input: "Tax yearly",             expected: { title: "Tax",      recurrence: "FREQ=YEARLY" } },
      { input: "Tax annually",           expected: { title: "Tax",      recurrence: "FREQ=YEARLY" } },
      { input: "Check every 2 days",     expected: { title: "Check",    recurrence: "FREQ=DAILY;INTERVAL=2" } },
      { input: "Check every 3 weeks",    expected: { title: "Check",    recurrence: "FREQ=WEEKLY;INTERVAL=3" } },
      // BUG: parseDate consumes "monday" as a bare weekday before parseRecurrence sees "every monday"
      { input: "Gym every monday",       expected: { title: "Gym",  recurrence: "FREQ=WEEKLY;BYDAY=MO" },
        note: "BUG: parseDate consumes 'monday' (step 5) before recurrence parser runs" },
      { input: "Gym every friday",       expected: { title: "Gym",  recurrence: "FREQ=WEEKLY;BYDAY=FR" },
        note: "BUG: parseDate consumes 'friday' (step 5) before recurrence parser runs" },
    ],
  },

  // ── 19. Recurrence — Danish ───────────────────────────────────────────────
  {
    name: "Recurrence — Danish",
    cases: [
      { input: "Morgenmad dagligt",          expected: { title: "Morgenmad",     recurrence: "FREQ=DAILY" } },
      { input: "Rapport ugentligt",          expected: { title: "Rapport",       recurrence: "FREQ=WEEKLY" } },
      { input: "Husleje månedligt",          expected: { title: "Husleje",       recurrence: "FREQ=MONTHLY" } },
      { input: "Backup årligt",              expected: { title: "Backup",        recurrence: "FREQ=YEARLY" } },
      { input: "Betaling hver måned",        expected: { title: "Betaling",      recurrence: "FREQ=MONTHLY" } },
      { input: "Vand planter hver 3. uge",   expected: { title: "Vand planter",  recurrence: "FREQ=WEEKLY;INTERVAL=3" } },
      { input: "Løb hver 2. dag",            expected: { title: "Løb",           recurrence: "FREQ=DAILY;INTERVAL=2" } },
      // BUG: parseDate consumes Danish weekday before recurrence parser
      { input: "Gym hver mandag",            expected: { title: "Gym",           recurrence: "FREQ=WEEKLY;BYDAY=MO" },
        note: "BUG: parseDate consumes 'mandag' (step 5) before recurrence parser runs" },
    ],
  },

  // ── 20. Full combinations ─────────────────────────────────────────────────
  {
    name: "Full combinations",
    cases: [
      // @ as date: @friday parsed, project + priority also work
      {
        input: "Fix #Jot login bug @friday !",
        expected: { title: "Fix login bug", projectName: "Jot", dueDate: "2026-04-17", priority: "high" },
      },
      // Non-date @word stays in title now that tags are hidden
      {
        input: "Buy milk @home tomorrow",
        expected: { title: "Buy milk @home", dueDate: "2026-04-16" },
      },
      {
        input: "Ring til læge! i morgen kl 14",
        expected: { title: "Ring til læge", priority: "high", dueDate: "2026-04-16", dueTime: "14:00" },
      },
      {
        input: "Tandlæge næste uge !!",
        expected: { title: "Tandlæge", dueDate: "2026-04-22", priority: "high" },
      },
      {
        input: "#Personal pay rent every month",
        expected: { title: "pay rent", projectName: "Personal", recurrence: "FREQ=MONTHLY" },
      },
      // @ as date + time in combination
      {
        input: "Standup #Work @monday at 9am",
        expected: { title: "Standup", projectName: "Work", dueDate: "2026-04-20", dueTime: "09:00" },
      },
    ],
  },

  // ── 21. Preposition & title cleanup ──────────────────────────────────────
  {
    name: "Preposition and title cleanup",
    cases: [
      // "for" stripped from end when the actual date was consumed
      { input: "Buy milk for tomorrow",        expected: { title: "Buy milk",           dueDate: "2026-04-16" } },
      { input: "Buy milk til i morgen",        expected: { title: "Buy milk",           dueDate: "2026-04-16" } },
      { input: "Report due friday",            expected: { title: "Report",             dueDate: "2026-04-17" } },
      { input: "Due tomorrow fix bug",         expected: { title: "fix bug",            dueDate: "2026-04-16" } },
      // "for" mid-title should NOT be stripped
      { input: "Prepare for the meeting",      expected: { title: "Prepare for the meeting" } },
      { input: "Read on the plane tomorrow",   expected: { title: "Read on the plane",  dueDate: "2026-04-16" } },
      // "til" mid-title preserved when it separates meaningful words
      { input: "Gave til mor i morgen",        expected: { title: "Gave til mor",       dueDate: "2026-04-16" } },
      { input: "Fly til London d. 20.",        expected: { title: "Fly til London",     dueDate: "2026-04-20" } },
      // Review PR with Danish "inden" + weekday + time
      { input: "Review PR inden monday kl 10", expected: { title: "Review PR",         dueDate: "2026-04-20", dueTime: "10:00" } },
      // "Danglish" mix
      { input: "Meeting with Karsten på fredag", expected: { title: "Meeting with Karsten", dueDate: "2026-04-17" } },
    ],
  },

  // ── 22. Edge cases ────────────────────────────────────────────────────────
  {
    name: "Edge cases",
    cases: [
      { input: "",                          expected: { title: "" } },
      { input: "   ",                       expected: { title: "" } },
      { input: "Buy milk",                  expected: { title: "Buy milk", dueDate: null, priority: "none" } },
      { input: "5 meetings today",          expected: { title: "5 meetings",  dueDate: "2026-04-15" } },
      { input: "BUY MILK TODAY",            expected: { title: "BUY MILK",    dueDate: "2026-04-15" } },
      { input: "Task with @ only",          expected: { title: "Task with @ only" } },
      { input: "#",                         expected: { title: "#", projectName: null } },
      { input: "plain task no metadata",    expected: { title: "plain task no metadata", dueDate: null, projectName: null, priority: "none", recurrence: null } },
      // Extra spaces normalised
      { input: "  buy   milk  today  ",     expected: { title: "buy milk",    dueDate: "2026-04-15" } },
    ],
  },

  // ── 23. PROPOSED: #project.space syntax ──────────────────────────────────
  // "#project.space" lets the user override which space/area the task lands in.
  // e.g. "#aftensmad.personlig" → project "aftensmad", area override "personlig"
  // All tests in this group are EXPECTED TO FAIL until the feature is built.
  {
    name: "PROPOSED — #project.space syntax (not yet implemented)",
    cases: [
      { input: "Køb gulerødder #Shopping.Personal",
        expected: { title: "Køb gulerødder", projectName: "Shopping" },
        note: "PROPOSED: dot notation overrides the default area for this task" },
      { input: "Team lunch #Work.Personal tomorrow",
        expected: { title: "Team lunch", projectName: "Work", dueDate: "2026-04-16" },
        note: "PROPOSED: area override with trailing date" },
    ],
  },

  // ── 25. PROPOSED: ! anchoring — only at word end, not mid-string ─────────
  // Document desired: "Fix bug!" → high priority, but "It's not! done" → no priority change.
  {
    name: "PROPOSED — ! only at sentence end",
    cases: [
      // This PASSES — trailing ! correctly detected
      { input: "Fix bug!",             expected: { title: "Fix bug",       priority: "high" } },
      // This should NOT trigger priority — ! is mid-sentence, not a priority marker
      // Currently PASSES (coincidentally) because trailingBang requires ! at very end
      { input: "It's not! done yet",   expected: { title: "It's not! done yet", priority: "none" } },
      // !!! at end → high
      { input: "Server down!!!",       expected: { title: "Server down",   priority: "high" } },
    ],
  },

];

// ─── Test Runner ─────────────────────────────────────────────────────────────

const PASS = "\x1b[32m✓\x1b[0m";
const FAIL = "\x1b[31m✗\x1b[0m";
const DIM  = "\x1b[2m";
const RESET = "\x1b[0m";
const RED  = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BOLD = "\x1b[1m";

function runTests() {
  let totalPassed = 0;
  let totalFailed = 0;
  const failures: string[] = [];

  console.log(`\n${BOLD}NLP Test Suite${RESET}  ${DIM}(frozen: 2026-04-15 Wednesday · run with TZ=UTC)${RESET}\n`);

  for (const group of groups) {
    let groupPassed = 0;
    let groupFailed = 0;
    const isProposed = group.name.startsWith("PROPOSED");

    console.log(`${BOLD}── ${group.name} ──${RESET}`);

    for (const { input, expected, note } of group.cases) {
      const result = parseInput(input, allProjects, allTags);
      const errs: string[] = [];

      if (expected.title !== undefined && result.title !== expected.title)
        errs.push(`title:    expected ${JSON.stringify(expected.title)}, got ${JSON.stringify(result.title)}`);

      if (expected.dueDate !== undefined && result.dueDate !== expected.dueDate)
        errs.push(`dueDate:  expected ${expected.dueDate ?? "null"}, got ${result.dueDate ?? "null"}`);

      if (expected.dueTime !== undefined && result.dueTime !== expected.dueTime)
        errs.push(`dueTime:  expected ${expected.dueTime ?? "null"}, got ${result.dueTime ?? "null"}`);

      if (expected.priority !== undefined && result.priority !== expected.priority)
        errs.push(`priority: expected ${expected.priority}, got ${result.priority}`);

      if (expected.projectName !== undefined) {
        const got = result.project?.name ?? null;
        if (got !== expected.projectName)
          errs.push(`project:  expected ${JSON.stringify(expected.projectName)}, got ${JSON.stringify(got)}`);
      }

      if (expected.suggestedProject !== undefined && result.suggestedProjectName !== expected.suggestedProject)
        errs.push(`suggestedProject: expected ${JSON.stringify(expected.suggestedProject)}, got ${JSON.stringify(result.suggestedProjectName)}`);

      if (expected.tagNames !== undefined) {
        const got = sorted(result.tags.map(t => t.name)).join(",");
        const want = sorted(expected.tagNames).join(",");
        if (got !== want)
          errs.push(`tags:     expected [${want}], got [${got}]`);
      }

      if (expected.suggestedTags !== undefined) {
        const got = sorted(result.suggestedTagNames).join(",");
        const want = sorted(expected.suggestedTags).join(",");
        if (got !== want)
          errs.push(`suggestedTags: expected [${want}], got [${got}]`);
      }

      if (expected.recurrence !== undefined && result.recurrenceRule !== expected.recurrence)
        errs.push(`recurrence: expected ${expected.recurrence ?? "null"}, got ${result.recurrenceRule ?? "null"}`);

      const passed = errs.length === 0;
      if (passed) {
        groupPassed++;
        totalPassed++;
        // For proposed groups, a "pass" might be unexpected — show it
        if (isProposed) {
          console.log(`  ${PASS} ${DIM}"${input}"${RESET}  ${YELLOW}(proposed — unexpectedly passing)${RESET}`);
        }
      } else {
        groupFailed++;
        totalFailed++;
        const marker = isProposed ? `${YELLOW}⊘${RESET}` : FAIL;
        console.log(`  ${marker} ${DIM}"${input}"${RESET}`);
        for (const e of errs) console.log(`      ${RED}${e}${RESET}`);
        if (note) console.log(`      ${DIM}↳ ${note}${RESET}`);
        failures.push(`[${group.name}] "${input}"`);
      }
    }

    // Print only failures inline; print group summary
    if (groupFailed === 0) {
      console.log(`  ${DIM}All ${groupPassed} passed${RESET}`);
    } else {
      console.log(`  ${DIM}${groupPassed} passed, ${groupFailed} failed${RESET}`);
    }
    console.log();
  }

  // Summary
  const total = totalPassed + totalFailed;
  const pct = Math.round((totalPassed / total) * 100);
  console.log(`${"─".repeat(50)}`);
  console.log(`${BOLD}SUMMARY  ${totalPassed}/${total} passed (${pct}%)${RESET}`);
  if (failures.length > 0) {
    console.log(`\n${BOLD}Failed tests:${RESET}`);
    failures.forEach(f => console.log(`  ${RED}${f}${RESET}`));
  }
  console.log();
}

runTests();
