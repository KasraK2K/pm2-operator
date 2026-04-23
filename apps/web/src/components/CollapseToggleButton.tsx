import { Minus, Plus } from "lucide-react";

interface CollapseToggleButtonProps {
  collapsed: boolean;
  onClick: () => void;
}

export function CollapseToggleButton({ collapsed, onClick }: CollapseToggleButtonProps) {
  return (
    <button
      aria-expanded={!collapsed}
      aria-label={collapsed ? "Expand" : "Collapse"}
      className="button-ghost h-8 w-8 p-0"
      onClick={onClick}
      title={collapsed ? "Expand" : "Collapse"}
      type="button"
    >
      {collapsed ? <Plus className="size-4" /> : <Minus className="size-4" />}
    </button>
  );
}
