import { parseInput } from "../src/lib/nlp"; // Adjust path as needed
import { Project, Tag } from "../src/types";

// --- Mocking Date for Deterministic Results ---
const MOCK_NOW = new Date("2026-04-15T12:00:00Z"); // A Wednesday
const RealDate = Date;

// @ts-ignore - Mocking global Date
global.Date = class extends RealDate {
  constructor(arg?: any) {
    if (arg === undefined) {
      super(MOCK_NOW);
    } else {
      super(arg);
    }
  }
} as any;

// --- Mock Data (Using 'as' to bypass strict interface requirements) ---
const mockProjects = [
  { id: "1", name: "Work" },
  { id: "2", name: "Personal" },
  { id: "3", name: "Jot Project" },
] as Project[]; // The 'as Project[]' tells TS: "Trust me, I know what I'm doing"

const mockTags = [
  { id: "t1", name: "home" },
  { id: "t2", name: "urgent" },
] as Tag[];

// --- Test Case Structure ---
interface TestCase {
  input: string;
  expected: {
    title: string;
    dueDate?: string | null;
    dueTime?: string | null;
    priority?: string;
    projectName?: string | null;
    tags?: string[];
    recurrence?: string | null;
  };
}

const tests: TestCase[] = [
  // --- 1. ENGLISH DATES (Basic to Advanced) ---
  { input: "Buy milk today", expected: { title: "Buy milk", dueDate: "2026-04-15" } },
  { input: "Call doctor tomorrow at 10:30", expected: { title: "Call doctor", dueDate: "2026-04-16", dueTime: "10:30" } },
  { input: "Meeting day after tomorrow", expected: { title: "Meeting", dueDate: "2026-04-17" } },
  { input: "Review docs next week", expected: { title: "Review docs", dueDate: "2026-04-22" } },
  { input: "Plan vacation end of month", expected: { title: "Plan vacation", dueDate: "2026-04-30" } },
  { input: "Pay taxes on April 30th", expected: { title: "Pay taxes", dueDate: "2026-04-30" } },
  { input: "Party 20th May", expected: { title: "Party", dueDate: "2026-05-20" } },

  // --- 2. DANISH DATES (Natural Language) ---
  { input: "Aflever pakke i dag", expected: { title: "Aflever pakke", dueDate: "2026-04-15" } },
  { input: "Tandlæge i morgen kl 9:15", expected: { title: "Tandlæge", dueDate: "2026-04-16", dueTime: "09:15" } },
  { input: "Fodbold i overmorgen", expected: { title: "Fodbold", dueDate: "2026-04-17" } },
  { input: "Frisør næste uge", expected: { title: "Frisør", dueDate: "2026-04-22" } },
  { input: "Deadline slutningen af måneden", expected: { title: "Deadline", dueDate: "2026-04-30" } },
  { input: "Fødselsdag d. 25. maj", expected: { title: "Fødselsdag", dueDate: "2026-05-25" } },
  { input: "Møde den 2. juni", expected: { title: "Møde", dueDate: "2026-06-02" } },

  // --- 3. RECURRENCE (The "Every" Gauntlet) ---
  { input: "Gym every monday", expected: { title: "Gym", recurrence: "FREQ=WEEKLY;BYDAY=MO" } },
  { input: "Walk dog daily", expected: { title: "Walk dog", recurrence: "FREQ=DAILY" } },
  { input: "Løb ugentligt", expected: { title: "Løb", recurrence: "FREQ=WEEKLY" } },
  { input: "Betal husleje hver måned", expected: { title: "Betal husleje", recurrence: "FREQ=MONTHLY" } },
  { input: "Check mail every 2 days", expected: { title: "Check mail", recurrence: "FREQ=DAILY;INTERVAL=2" } },
  { input: "Vand planter hver 3. uge", expected: { title: "Vand planter", recurrence: "FREQ=WEEKLY;INTERVAL=3" } },

  // --- 4. PRIORITY & TAGS (Special Characters) ---
  { input: "Fix bug !urgent", expected: { title: "Fix bug", priority: "high" } },
  { input: "Send report !!", expected: { title: "Send report", priority: "high" } },
  { input: "Low priority task !3", expected: { title: "Low priority task", priority: "low" } },
  { input: "Meeting @work @boss", expected: { title: "Meeting", tags: ["work", "boss"] } },
  { input: "Contact support@jot.app", expected: { title: "Contact support@jot.app", tags: [] } }, // Email protection

  // --- 5. PROJECTS (Hash & Fuzzy) ---
  { input: "Design new UI #Jot Project", expected: { title: "Design new UI", projectName: "Jot Project" } },
  { input: "Write blog post for Work", expected: { title: "Write blog post", projectName: "Work" } },
  { input: "Fix thing for Personal", expected: { title: "Fix thing", projectName: "Personal" } },

  // --- 6. THE "DANGLISH" MIX (Bilingual Stress) ---
  { input: "Meeting with Karsten på fredag", expected: { title: "Meeting with Karsten", dueDate: "2026-04-17" } },
  { input: "Review PR inden monday kl 10", expected: { title: "Review PR", dueDate: "2026-04-20", dueTime: "10:00" } },
  { input: "Call boss at klokken 14", expected: { title: "Call boss", dueTime: "14:00" } },

  // --- 7. CLEANUP & PREPOSITION TRAPS ---
  // These test if the "for/til/on" is correctly removed when it's metadata, 
  // but kept when it's part of the actual task title.
  { input: "Gave til mor i morgen", expected: { title: "Gave til mor", dueDate: "2026-04-16" } },
  { input: "Prepare for interview next week", expected: { title: "Prepare for interview", dueDate: "2026-04-22" } },
  { input: "Read on the plane tomorrow", expected: { title: "Read on the plane", dueDate: "2026-04-16" } },
  { input: "Fly til London d. 20. maj", expected: { title: "Fly til London", dueDate: "2026-05-20" } }
];

// --- Test Runner ---
function runTests() {
  let passed = 0;
  console.log(`\n🚀 Starting NLP Module Tests (Frozen Date: 2026-04-15)\n`);

  tests.forEach(({ input, expected }, index) => {
    const result = parseInput(input, mockProjects, mockTags);
    const errors: string[] = [];

    if (result.title !== expected.title) errors.push(`Title: expected "${expected.title}", got "${result.title}"`);
    if (expected.dueDate !== undefined && result.dueDate !== expected.dueDate) errors.push(`Date: expected ${expected.dueDate}, got ${result.dueDate}`);
    if (expected.dueTime !== undefined && result.dueTime !== expected.dueTime) errors.push(`Time: expected ${expected.dueTime}, got ${result.dueTime}`);
    if (expected.priority !== undefined && result.priority !== expected.priority) errors.push(`Priority: expected ${expected.priority}, got ${result.priority}`);
    if (expected.projectName !== undefined && result.project?.name !== expected.projectName) errors.push(`Project: expected ${expected.projectName}, got ${result.project?.name}`);
    if (expected.recurrence !== undefined && result.recurrenceRule !== expected.recurrence) errors.push(`Recurrence: expected ${expected.recurrence}, got ${result.recurrenceRule}`);

    if (errors.length === 0) {
      console.log(`✅ [Test ${index + 1}] Passed: "${input}"`);
      passed++;
    } else {
      console.log(`❌ [Test ${index + 1}] Failed: "${input}"`);
      errors.forEach(err => console.log(`   - ${err}`));
    }
  });

  console.log(`\n--- Summary: ${passed}/${tests.length} tests passed ---\n`);
}

runTests();