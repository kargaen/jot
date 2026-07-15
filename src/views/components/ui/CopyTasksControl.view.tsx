import type { CSSProperties } from "react";
import { Clipboard } from "lucide-react";
import type { TaskWithTags } from "../../../models/shared";
import { useCopyTasks } from "../../../hooks/useCopyTasks";

// EPIC-014: the one reusable copy affordance — JSON/MD format chips + a clipboard
// button. Any list container passes the tasks it shows; this control turns them
// into a clipboard write in the chosen format. Presentational: all wiring is in
// `useCopyTasks`. `onCopied` lets the container surface its own feedback.
interface Props {
  tasks: TaskWithTags[];
  onCopied?: (message: string) => void;
}

export default function CopyTasksControl({ tasks, onCopied }: Props) {
  const { format, pick, copy } = useCopyTasks();

  async function handleCopy() {
    const message = await copy(tasks);
    onCopied?.(message);
  }

  return (
    <div style={styles.group}>
      {(["json", "markdown"] as const).map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => pick(f)}
          style={{ ...styles.chip, ...(format === f ? styles.chipActive : null) }}
          aria-pressed={format === f}
          aria-label={`Copy format ${f === "markdown" ? "Markdown" : "JSON"}`}
        >
          {f === "markdown" ? "MD" : "JSON"}
        </button>
      ))}
      <button
        type="button"
        onClick={() => void handleCopy()}
        style={styles.button}
        aria-label={`Copy tasks as ${format === "markdown" ? "Markdown" : "JSON"}`}
      >
        <Clipboard size={18} color="var(--text-secondary)" />
      </button>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  group: { flexShrink: 0, display: "flex", alignItems: "center", gap: 4 },
  chip: {
    height: 24,
    padding: "0 8px",
    borderRadius: 8,
    border: "1px solid var(--border-default)",
    background: "transparent",
    color: "var(--text-tertiary)",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.2,
    cursor: "pointer",
  },
  chipActive: { borderColor: "var(--accent)", color: "var(--accent)" },
  button: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    padding: 0,
    border: "none",
    background: "transparent",
    cursor: "pointer",
  },
};
