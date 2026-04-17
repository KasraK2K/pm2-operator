import { useId } from "react";

interface BrandMarkProps {
  className?: string;
  decorative?: boolean;
}

interface BrandLockupProps {
  align?: "left" | "center";
  size?: "compact" | "default" | "hero";
  descriptor?: string;
  showDescriptor?: boolean;
  className?: string;
}

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function BrandMark({ className = "size-11", decorative = true }: BrandMarkProps) {
  const gradientId = useId();
  const glowId = useId();

  return (
    <svg
      aria-hidden={decorative}
      className={className}
      fill="none"
      role={decorative ? "presentation" : "img"}
      viewBox="0 0 72 72"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gradientId} x1="16" x2="56" y1="18" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="0.58" stopColor="var(--warning)" />
          <stop offset="1" stopColor="var(--success)" />
        </linearGradient>
        <radialGradient id={glowId} cx="0" cy="0" r="1" gradientTransform="translate(42 54) rotate(148) scale(29 24)" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--accent-soft)" />
          <stop offset="1" stopColor="transparent" />
        </radialGradient>
      </defs>

      <rect
        fill="var(--surface-strong)"
        height="58"
        rx="17"
        stroke="var(--border-strong)"
        strokeWidth="2"
        width="58"
        x="7"
        y="7"
      />
      <rect fill={`url(#${glowId})`} height="46" rx="14" width="46" x="13" y="13" />

      <rect
        fill="none"
        height="31"
        rx="8"
        stroke={`url(#${gradientId})`}
        strokeWidth="2.5"
        width="40"
        x="16"
        y="17"
      />
      <circle cx="23" cy="24" fill="var(--text-soft)" opacity="0.8" r="2.4" />
      <path
        d="M28 24H35"
        stroke="var(--text-soft)"
        strokeLinecap="round"
        strokeWidth="2.2"
      />
      <path
        d="M23 32H34"
        stroke="var(--text-muted)"
        strokeLinecap="round"
        strokeWidth="2.2"
      />
      <path
        d="M23 38H31"
        stroke="var(--text-muted)"
        strokeLinecap="round"
        strokeWidth="2.2"
      />
      <path
        d="M18 54H24L29 46L34 57L41 42L46 49L54 44"
        stroke={`url(#${gradientId})`}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
      <path
        d="M18 54H54"
        opacity="0.35"
        stroke="var(--border-strong)"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function BrandLockup({
  align = "left",
  size = "default",
  descriptor = "Remote PM2 operations console",
  showDescriptor = true,
  className
}: BrandLockupProps) {
  const centered = align === "center";
  const markClassName =
    size === "hero" ? "size-16 sm:size-[4.5rem]" : size === "compact" ? "size-10" : "size-12";
  const titleClassName =
    size === "hero"
      ? "text-[1.65rem] sm:text-[1.95rem]"
      : size === "compact"
        ? "text-sm"
        : "text-base";
  const descriptorClassName =
    size === "hero" ? "text-xs sm:text-sm tracking-[0.28em]" : "text-[10px] tracking-[0.22em]";

  return (
    <div
      className={joinClasses(
        "flex items-center gap-3",
        centered ? "justify-center text-center" : "justify-start text-left",
        className
      )}
    >
      <BrandMark className={markClassName} />
      <div className={joinClasses("min-w-0", centered && "items-center")}>
        {showDescriptor ? (
          <div
            className={joinClasses(
              "font-mono-ui uppercase text-[color:var(--text-soft)]",
              descriptorClassName
            )}
          >
            {descriptor}
          </div>
        ) : null}
        <div className={joinClasses("font-semibold leading-none text-[color:var(--text)]", titleClassName)}>
          <span className="text-[color:var(--accent)]">PM2</span>{" "}
          <span className="text-[color:var(--text)]">Log Viewer</span>
        </div>
      </div>
    </div>
  );
}
