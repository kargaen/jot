import { parseInput } from "../../../src/services/capture/nlp.service";
import type { Project, Tag } from "../../../src/models/shared";

const RealDate = Date;
const MOCK_NOW = new RealDate("2026-04-15T12:00:00Z");

(globalThis as unknown as { Date: DateConstructor }).Date = class MockDate extends RealDate {
  constructor(...args: ConstructorParameters<DateConstructor>) {
    if (args.length === 0) super(MOCK_NOW.getTime());
    else if (args.length === 1) super(args[0]);
    else super(...args);
  }
  static now() { return MOCK_NOW.getTime(); }
  static parse = RealDate.parse.bind(RealDate);
  static UTC = RealDate.UTC.bind(RealDate);
} as unknown as DateConstructor;

const projects: Project[] = [
  { id: "p1", name: "Work" } as Project,
];

const tags: Tag[] = [];

const cases = [
  {
    input: "Check in at noon today",
    expected: { title: "Check in", dueDate: "2026-04-15", dueTime: "12:00" },
  },
  {
    input: "Ship build at midnight",
    expected: { title: "Ship build", dueTime: "00:00" },
  },
  {
    input: "Read briefing tonight",
    expected: { title: "Read briefing", dueDate: "2026-04-15", dueTime: "19:00" },
  },
  {
    input: "Call Alex this afternoon",
    expected: { title: "Call Alex", dueDate: "2026-04-15", dueTime: "15:00" },
  },
  {
    input: "Plan every weekday",
    expected: { title: "Plan", recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" },
  },
  {
    input: "Recover every weekend",
    expected: { title: "Recover", recurrenceRule: "FREQ=WEEKLY;BYDAY=SA,SU" },
  },
  {
    input: "Write recap tonight #Work",
    expected: { title: "Write recap", dueDate: "2026-04-15", dueTime: "19:00", projectName: "Work" },
  },
];

const languageCases = [
  {
    label: "english-only rejects danish date words",
    input: "Ring i morgen",
    options: { languageMode: "en" as const },
    expected: { title: "Ring i morgen", dueDate: undefined },
  },
  {
    label: "danish-only rejects english date words",
    input: "Call tomorrow",
    options: { languageMode: "da" as const },
    expected: { title: "Call tomorrow", dueDate: undefined },
  },
  {
    label: "danish-only understands danish date words",
    input: "Ring i morgen",
    options: { languageMode: "da" as const },
    expected: { title: "Ring", dueDate: "2026-04-16" },
  },
  {
    label: "english-only understands english recurrence",
    input: "Plan every weekday",
    options: { languageMode: "en" as const },
    expected: { title: "Plan", recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" },
  },
  {
    label: "danish-only ignores english recurrence",
    input: "Plan every weekday",
    options: { languageMode: "da" as const },
    expected: { title: "Plan every weekday", recurrenceRule: undefined },
  },
];

let failed = 0;

for (const testCase of cases) {
  const result = parseInput(testCase.input, projects, tags);
  const actual = {
    title: result.title,
    dueDate: result.dueDate ?? undefined,
    dueTime: result.dueTime ?? undefined,
    recurrenceRule: result.recurrenceRule ?? undefined,
    projectName: result.project?.name ?? undefined,
  };

  for (const [key, expectedValue] of Object.entries(testCase.expected)) {
    const actualValue = actual[key as keyof typeof actual];
    if (actualValue !== expectedValue) {
      failed++;
      console.error(`${testCase.input}\n  ${key}: expected ${expectedValue}, got ${actualValue ?? "undefined"}`);
    }
  }
}

for (const testCase of languageCases) {
  const result = parseInput(testCase.input, projects, tags, testCase.options);
  const actual = {
    title: result.title,
    dueDate: result.dueDate ?? undefined,
    recurrenceRule: result.recurrenceRule ?? undefined,
  };

  for (const [key, expectedValue] of Object.entries(testCase.expected)) {
    const actualValue = actual[key as keyof typeof actual];
    if (actualValue !== expectedValue) {
      failed++;
      console.error(`${testCase.label}\n  ${key}: expected ${expectedValue}, got ${actualValue ?? "undefined"}`);
    }
  }
}

if (failed > 0) {
  console.error(`\nNLP natural-language tests failed: ${failed}`);
  process.exit(1);
}

console.log(`NLP natural-language tests passed: ${cases.length + languageCases.length}/${cases.length + languageCases.length}`);
