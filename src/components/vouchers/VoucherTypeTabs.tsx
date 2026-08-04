import { useNavigate } from "react-router-dom";
import { VOUCHER_TYPE_CONFIGS, VOUCHER_TYPE_ORDER, type EngineVoucherType } from "@/lib/voucherTypeConfig";

interface Props {
  active: EngineVoucherType;
  /** True once the grid has any non-empty row — gate type switches behind a confirm. */
  isDirty: boolean;
}

/**
 * Tally-style top tab strip: one colored tab per accounting voucher type,
 * shortcut label shown under the name. Clicking (or the matching F-key via
 * useVoucherShortcuts) navigates straight to that type's route.
 */
export default function VoucherTypeTabs({ active, isDirty }: Props) {
  const navigate = useNavigate();

  const go = (path: string) => {
    if (isDirty && !window.confirm("Discard the current entry and switch voucher type?")) return;
    navigate(path);
  };

  return (
    <div className="flex gap-1 border-b border-border overflow-x-auto">
      {VOUCHER_TYPE_ORDER.map((t) => {
        const cfg = VOUCHER_TYPE_CONFIGS[t];
        const isActive = t === active;
        return (
          <button
            key={t}
            type="button"
            onClick={() => go(cfg.path)}
            className={`${cfg.themeClass} px-4 py-2 text-sm font-sans font-semibold whitespace-nowrap rounded-t-lg transition-colors ${
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {cfg.label}
            <span className={`ml-2 text-[10px] font-normal ${isActive ? "opacity-80" : "opacity-60"}`}>
              {cfg.shortcutLabel}
            </span>
          </button>
        );
      })}
    </div>
  );
}
