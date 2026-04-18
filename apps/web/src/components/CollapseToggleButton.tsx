import { ChevronDown } from "lucide-react";

interface CollapseToggleButtonProps {
  collapsed: boolean;
  onClick: () => void;
}

export function CollapseToggleButton({ collapsed, onClick }: CollapseToggleButtonProps) {
  return (
    <button
      aria-expanded={!collapsed}
      className="button-ghost h-8 px-2 text-xs"
      onClick={onClick}
      type="button"
    >
      <ChevronDown className={`mr-1 size-4 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
      {collapsed ? "Expand" : "Collapse"}
    </button>
  );
}
