import { X } from "lucide-react";
import type { SourceOverlayView } from "../../workbench";
import { Button } from "@/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/ui/dialog";
import { SourceSnippet } from "@/ui/visualizer";
import { VISUALIZER_TEST_IDS } from "@/test-ids";

export const sourceOverlayOpenChange = (open: boolean, onClose: () => void): void => {
  if (!open) onClose();
};

export const SourceOverlay = ({
  view,
  onClose,
}: {
  view: SourceOverlayView;
  onClose: () => void;
}) => (
  <Dialog open={view.open} onOpenChange={(open) => sourceOverlayOpenChange(open, onClose)}>
    <DialogContent
      className="max-h-[min(760px,calc(100vh-2rem))] max-w-[min(920px,calc(100vw-2rem))] overflow-hidden border bg-card p-0"
      showCloseButton={false}
      data-testid={VISUALIZER_TEST_IDS.source.overlay}
    >
      {view.open ? (
        <>
          <DialogHeader className="border-b bg-[color:var(--vf-surface-raised)] px-4 py-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <DialogTitle className="truncate text-sm">{view.title}</DialogTitle>
                <DialogDescription className="font-mono text-[11px]">
                  source v{view.sourceVersion} · anchors {view.anchorCount}
                </DialogDescription>
              </div>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label="Close source overlay"
                  data-testid={VISUALIZER_TEST_IDS.source.overlayClose}
                >
                  <X aria-hidden="true" />
                </Button>
              </DialogClose>
            </div>
          </DialogHeader>

          <div className="min-h-0 overflow-auto p-4">
            {view.fallback ? (
              <p
                className="rounded-md border bg-background p-3 text-sm text-muted-foreground"
                data-testid={VISUALIZER_TEST_IDS.source.overlayFallback}
              >
                {view.fallback}
              </p>
            ) : (
              <SourceSnippet lines={view.lines} data-testid={VISUALIZER_TEST_IDS.source.snippet} />
            )}
          </div>

          <DialogFooter className="border-t bg-[color:var(--vf-surface-soft)]">
            <DialogClose asChild>
              <Button type="button" variant="outline" size="sm">
                Close
              </Button>
            </DialogClose>
          </DialogFooter>
        </>
      ) : null}
    </DialogContent>
  </Dialog>
);
