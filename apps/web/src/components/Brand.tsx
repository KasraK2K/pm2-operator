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

const LOGO_SRC = "/pm2-operator-logo-lockup.png";

export function BrandMark({ className = "h-11 w-auto", decorative = true }: BrandMarkProps) {
  return (
    <img
      alt={decorative ? "" : "PM2 Operator"}
      aria-hidden={decorative}
      className={joinClasses("w-auto select-none object-contain", className)}
      draggable={false}
      role={decorative ? "presentation" : undefined}
      src={LOGO_SRC}
    />
  );
}

export function BrandLockup({
  align = "left",
  size = "default",
  descriptor = "Remote PM2 operator console",
  showDescriptor = true,
  className
}: BrandLockupProps) {
  const centered = align === "center";
  const markClassName =
    size === "hero" ? "h-16 sm:h-20" : size === "compact" ? "h-10" : "h-12";
  const descriptorClassName =
    size === "hero" ? "text-xs sm:text-sm tracking-[0.28em]" : "text-[10px] tracking-[0.22em]";
  const shouldShowDescriptor = showDescriptor && size !== "compact";

  return (
    <div
      className={joinClasses(
        "flex flex-col gap-1.5",
        centered ? "items-center text-center" : "items-start text-left",
        className
      )}
    >
      {shouldShowDescriptor ? (
        <div
          className={joinClasses(
            "font-mono-ui uppercase text-[color:var(--text-soft)]",
            descriptorClassName
          )}
        >
          {descriptor}
        </div>
      ) : null}
      <BrandMark className={markClassName} decorative={false} />
    </div>
  );
}
