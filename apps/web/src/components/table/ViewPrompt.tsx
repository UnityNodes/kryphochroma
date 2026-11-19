"use client";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { TableViewMode } from "@/game/tableView";
import { ViewPicker } from "./ViewPicker";

export function ViewPrompt({ open, view, onChoose, onClose }: { readonly open: boolean; readonly view: TableViewMode; readonly onChoose: (mode: TableViewMode) => void; readonly onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="kc-box kc-box-wide max-h-[92dvh] overflow-auto">
        <DialogTitle className="pr-8">How do you want to see the table?</DialogTitle>
        <DialogDescription>Pick one to start. You can switch any time with the 2D and 3D chip at the top.</DialogDescription>
        <ViewPicker
          view={view}
          onChoose={(mode) => {
            onChoose(mode);
            onClose();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
