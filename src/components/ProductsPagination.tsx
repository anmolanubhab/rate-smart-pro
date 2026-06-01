import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ProductsPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  loading?: boolean;
}

const PAGE_SIZE_OPTIONS = [50, 100, 250, 500];

export const ProductsPagination = ({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  loading = false,
}: ProductsPaginationProps) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  // Generate page number buttons (show max 7 at a time)
  const getPageNumbers = () => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 4) pages.push("...");
      const start = Math.max(2, page - 2);
      const end = Math.min(totalPages - 1, page + 2);
      for (let i = start; i <= end; i++) pages.push(i);
      if (page < totalPages - 3) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-border bg-muted/30 text-sm">
      {/* Record count */}
      <div className="text-muted-foreground tabular-nums whitespace-nowrap">
        {loading ? (
          <span className="animate-pulse">Loading…</span>
        ) : total === 0 ? (
          "No records"
        ) : (
          <>
            Showing{" "}
            <span className="font-semibold text-foreground">
              {from.toLocaleString()}–{to.toLocaleString()}
            </span>{" "}
            of{" "}
            <span className="font-semibold text-foreground">{total.toLocaleString()}</span>{" "}
            Products
          </>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap justify-center">
        {/* Page size selector */}
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <span className="text-xs whitespace-nowrap">Rows per page:</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(Number(v))}
            disabled={loading}
          >
            <SelectTrigger className="h-7 w-16 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => onPageChange(1)}
            disabled={page === 1 || loading}
            title="First page"
          >
            <ChevronsLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1 || loading}
            title="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>

          {getPageNumbers().map((p, i) =>
            p === "..." ? (
              <span key={`ellipsis-${i}`} className="px-1 text-muted-foreground select-none">
                …
              </span>
            ) : (
              <Button
                key={p}
                variant={p === page ? "default" : "outline"}
                size="icon"
                className="h-7 w-7 text-xs"
                onClick={() => onPageChange(p as number)}
                disabled={loading}
              >
                {p}
              </Button>
            )
          )}

          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => onPageChange(page + 1)}
            disabled={page === totalPages || loading}
            title="Next page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => onPageChange(totalPages)}
            disabled={page === totalPages || loading}
            title="Last page"
          >
            <ChevronsRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
};
