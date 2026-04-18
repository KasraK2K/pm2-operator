import type { Tag } from "../lib/types";

interface TagChipProps {
  tag?: Pick<Tag, "name" | "color">;
  label?: string;
  active?: boolean;
  compact?: boolean;
  clickable?: boolean;
  showDot?: boolean;
  onClick?: () => void;
  title?: string;
}

export function TagChip({
  tag,
  label,
  active = false,
  compact = false,
  clickable = false,
  showDot = true,
  onClick,
  title
}: TagChipProps) {
  const content = (
    <>
      {showDot ? (
        <span
          className={`rounded-full ${compact ? "size-1.5" : "size-2"}`}
          style={{ backgroundColor: tag?.color ?? "#64748b" }}
        />
      ) : null}
      <span className="truncate">{label ?? tag?.name ?? ""}</span>
    </>
  );

  const className = "tag-chip";

  if (onClick) {
    return (
      <button
        className={className}
        data-active={active}
        data-clickable={clickable}
        data-compact={compact}
        onClick={onClick}
        title={title ?? label ?? tag?.name}
        type="button"
      >
        {content}
      </button>
    );
  }

  return (
    <span
      className={className}
      data-active={active}
      data-compact={compact}
      title={title ?? label ?? tag?.name}
    >
      {content}
    </span>
  );
}
