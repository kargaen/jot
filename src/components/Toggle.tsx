export default function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: 32, height: 18, borderRadius: 9, flexShrink: 0, cursor: "pointer",
        background: on ? "var(--accent)" : "var(--bg-tertiary)",
        position: "relative", transition: "background 150ms",
      }}
    >
      <span style={{
        position: "absolute", top: 2, left: on ? 14 : 2,
        width: 14, height: 14, borderRadius: "50%", background: "#fff",
        transition: "left 150ms", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
      }} />
    </button>
  );
}
