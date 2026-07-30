import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { PrintCopyType } from "@/lib/printCopyTypes";

type Mode = "original" | "all" | "custom";

export default function PrintCopyDialog({
  open,
  onOpenChange,
  copyTypes,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Enabled copy types for this business, sorted. */
  copyTypes: PrintCopyType[];
  onConfirm: (labels: string[]) => void;
}) {
  const [mode, setMode] = useState<Mode>("original");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setMode("original");
    setSelected(new Set(copyTypes.filter((c) => c.is_default).map((c) => c.label)));
  }, [open, copyTypes]);

  const originalLabels = () => {
    const defaults = copyTypes.filter((c) => c.is_default).map((c) => c.label);
    if (defaults.length) return defaults;
    return copyTypes.length ? [copyTypes[0].label] : [];
  };

  const toggle = (label: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(label);
      else next.delete(label);
      return next;
    });
  };

  const confirm = () => {
    const labels =
      mode === "original" ? originalLabels()
      : mode === "all" ? copyTypes.map((c) => c.label)
      : Array.from(selected);
    if (!labels.length) return;
    onConfirm(labels);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Print Options</DialogTitle>
          <DialogDescription>Choose which copies to print. Every copy shares the same data — only the label changes.</DialogDescription>
        </DialogHeader>

        <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)} className="space-y-3">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="original" id="copy-mode-original" />
            <Label htmlFor="copy-mode-original" className="font-normal">Original Only</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="all" id="copy-mode-all" disabled={!copyTypes.length} />
            <Label htmlFor="copy-mode-all" className="font-normal">All Copies</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="custom" id="copy-mode-custom" disabled={!copyTypes.length} />
            <Label htmlFor="copy-mode-custom" className="font-normal">Custom Selection</Label>
          </div>
        </RadioGroup>

        {mode === "custom" && (
          <div className="space-y-2 rounded-lg border border-border p-3">
            {copyTypes.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <Checkbox
                  id={`copy-${c.id}`}
                  checked={selected.has(c.label)}
                  onCheckedChange={(checked) => toggle(c.label, checked === true)}
                />
                <Label htmlFor={`copy-${c.id}`} className="font-normal">{c.label}</Label>
              </div>
            ))}
            {!copyTypes.length && <p className="text-sm text-muted-foreground">No copy types configured.</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={confirm} disabled={mode === "custom" && selected.size === 0}>Print</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
