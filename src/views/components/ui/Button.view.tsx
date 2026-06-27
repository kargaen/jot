import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import Spinner from "./Spinner.view";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "md" | "lg";

const BASE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  borderRadius: "var(--radius-lg)",
  fontSize: 14,
  fontWeight: 650,
  fontFamily: "inherit",
  cursor: "pointer",
  padding: "12px 16px",
};

const VARIANTS: Record<Variant, CSSProperties> = {
  primary: {
    background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
    color: "#fff",
    border: "none",
    boxShadow: "0 10px 24px var(--accent-light)",
  },
  secondary: {
    background: "var(--bg-secondary)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
  },
  danger: {
    background: "var(--danger)",
    color: "#fff",
    border: "none",
  },
  ghost: {
    background: "transparent",
    color: "var(--text-secondary)",
    border: "1px solid var(--border-default)",
  },
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
  children?: ReactNode;
}

export default function Button({
  variant = "primary",
  size = "md",
  fullWidth,
  loading,
  disabled,
  children,
  style,
  ...rest
}: Props) {
  const isDisabled = disabled || loading;
  return (
    <button
      disabled={isDisabled}
      style={{
        ...BASE,
        ...VARIANTS[variant],
        ...(size === "lg" ? { padding: "14px 18px", fontSize: 15 } : null),
        ...(fullWidth ? { width: "100%" } : null),
        ...(isDisabled ? { opacity: 0.6, cursor: "default" } : null),
        ...style,
      }}
      {...rest}
    >
      {loading ? <Spinner size={14} color="currentColor" /> : null}
      {children}
    </button>
  );
}
