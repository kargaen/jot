import { Loader2 } from "lucide-react";

// Inject the spin keyframe once so the spinner works with inline styles.
if (
  typeof document !== "undefined" &&
  !document.getElementById("jot-spin-keyframes")
) {
  const el = document.createElement("style");
  el.id = "jot-spin-keyframes";
  el.textContent = "@keyframes jot-spin{to{transform:rotate(360deg)}}";
  document.head.appendChild(el);
}

export default function Spinner({
  size = 14,
  color = "currentColor",
}: {
  size?: number;
  color?: string;
}) {
  return (
    <Loader2
      size={size}
      color={color}
      style={{ animation: "jot-spin 0.6s linear infinite", flexShrink: 0 }}
      aria-hidden
    />
  );
}
