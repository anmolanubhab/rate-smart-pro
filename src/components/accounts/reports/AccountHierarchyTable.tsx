import { fmtInr, type AccountHierarchyGroup, type AccountHierarchyLedger } from "@/lib/accounting";

type Node = AccountHierarchyGroup | AccountHierarchyLedger;

interface Props {
  nodes: Node[];
  depth?: number;
  onGroupClick: (id: string) => void;
  onLedgerClick: (row: { id: string; party_id: string | null }) => void;
}

/** Recursive, always-expanded renderer for the account_groups tree — used
 *  by Trial Balance's "Grouped" view. Arbitrary depth, driven entirely by
 *  whatever buildAccountHierarchy() returns; does no aggregation of its own,
 *  only lays out the dr/cr numbers it's handed. Group rows drill into the
 *  same generic /accounts/group/:id screen Balance Sheet uses; ledger rows
 *  drill into the same Ledger/Party Statement every report uses. */
export default function AccountHierarchyTable({ nodes, depth = 0, onGroupClick, onLedgerClick }: Props) {
  return (
    <>
      {nodes.map((n) => (
        <div key={n.id}>
          <div
            className="flex items-center justify-between gap-2 py-1.5 px-2 border-b border-border/50 hover:bg-muted/30 cursor-pointer"
            style={{ paddingLeft: `${depth * 20 + 8}px`, lineHeight: 1.45 }}
            onClick={() =>
              n.kind === "group" ? onGroupClick(n.id) : onLedgerClick({ id: n.id, party_id: n.party_id })
            }
          >
            {/* whitespace-normal + break-words, not truncate -- a long name
                like "PUNJAB NATIONAL BANK" must wrap, never clip. */}
            <span
              className={`text-sm whitespace-normal break-words ${n.kind === "group" ? "font-semibold" : "text-muted-foreground"}`}
              style={{ overflowWrap: "anywhere" }}
            >
              {n.name}
            </span>
            <span className="flex gap-6 shrink-0">
              <span className="w-28 text-right text-sm tabular-nums">{n.dr > 0 ? `₹ ${fmtInr(n.dr)}` : ""}</span>
              <span className="w-28 text-right text-sm tabular-nums">{n.cr > 0 ? `₹ ${fmtInr(n.cr)}` : ""}</span>
            </span>
          </div>
          {n.kind === "group" && n.children.length > 0 && (
            <AccountHierarchyTable nodes={n.children} depth={depth + 1} onGroupClick={onGroupClick} onLedgerClick={onLedgerClick} />
          )}
        </div>
      ))}
      {nodes.length === 0 && depth === 0 && (
        <div className="px-4 py-12 text-center text-muted-foreground text-sm">No data</div>
      )}
    </>
  );
}
