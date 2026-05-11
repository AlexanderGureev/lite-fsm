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
import { IconButton, PanelKicker, SourceEditorShell } from "@/ui/visualizer";
import { VISUALIZER_TEST_IDS } from "@/test-ids";

export const sourceOverlayOpenChange = (open: boolean, onClose: () => void): void => {
  if (!open) onClose();
};

const SourceOverlayCode = ({ lines }: { lines: Extract<SourceOverlayView, { open: true }>["lines"] }) => {
  const firstLineNumber = lines[0]!.line;
  const highlightedLineNumbers = lines.filter((line) => line.selected).map((line) => line.line - firstLineNumber + 1);

  return (
    <SourceEditorShell
      key={`${firstLineNumber}:${lines.length}:${highlightedLineNumbers.join(",")}`}
      label="Source overlay snippet"
      value={lines.map((line) => line.code).join("\n")}
      textareaTestId={VISUALIZER_TEST_IDS.source.snippet}
      className="h-full"
      textareaClassName="h-full min-h-full"
      readOnly
      firstLineNumber={firstLineNumber}
      highlightedLineNumbers={highlightedLineNumbers}
    />
  );
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
      className="grid h-[min(860px,calc(100vh-1.5rem))] max-h-[calc(100vh-1.5rem)] w-[min(1280px,calc(100vw-1.5rem))] max-w-[min(1280px,calc(100vw-1.5rem))] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden border bg-card p-0 sm:max-w-[min(1280px,calc(100vw-1.5rem))]"
      showCloseButton={false}
      data-testid={VISUALIZER_TEST_IDS.source.overlay}
    >
      {view.open ? (
        <>
          <DialogHeader className="border-b border-(--vf-border-soft) bg-(--vf-surface-soft) px-4 py-2.5">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <PanelKicker>Source · machine</PanelKicker>
                <DialogTitle
                  className="mt-0.5 truncate font-mono text-[13px] font-semibold"
                  data-testid={VISUALIZER_TEST_IDS.source.overlayTitle}
                >
                  {view.title}
                </DialogTitle>
                <DialogDescription
                  className="font-mono text-[10px] text-(--vf-text-quiet) tabular-nums"
                  data-testid={VISUALIZER_TEST_IDS.source.overlayDescription}
                  data-source-version={view.sourceVersion}
                  data-anchor-count={view.anchorCount}
                  data-location-label={view.locationLabel ?? ""}
                >
                  source v{view.sourceVersion} · anchors {view.anchorCount}
                  {view.locationLabel ? ` · ${view.locationLabel}` : ""}
                </DialogDescription>
              </div>
              <DialogClose asChild>
                <IconButton
                  type="button"
                  aria-label="Close source overlay"
                  title="Close · Esc"
                  data-testid={VISUALIZER_TEST_IDS.source.overlayClose}
                >
                  <X aria-hidden="true" />
                </IconButton>
              </DialogClose>
            </div>
          </DialogHeader>

          <div className="min-h-0 overflow-hidden bg-(--vf-bg) p-3.5">
            {view.fallback ? (
              <p
                className="h-full overflow-auto rounded-md border bg-(--vf-surface-soft) p-3 font-mono text-[11px] text-(--vf-text-muted)"
                data-testid={VISUALIZER_TEST_IDS.source.overlayFallback}
                data-fallback="true"
              >
                {view.fallback}
              </p>
            ) : (
              <SourceOverlayCode lines={view.lines} />
            )}
          </div>

          <DialogFooter className="mx-0 mb-0 rounded-none border-t border-(--vf-border-soft) bg-(--vf-surface-soft) px-4 py-2">
            <DialogClose asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 border-(--vf-border) bg-(--vf-surface) px-3 font-mono text-[11px] hover:bg-(--vf-surface-raised)"
                data-testid={VISUALIZER_TEST_IDS.source.overlayFooterClose}
              >
                <X data-icon="inline-start" aria-hidden="true" className="size-3.5" />
                close
              </Button>
            </DialogClose>
          </DialogFooter>
        </>
      ) : null}
    </DialogContent>
  </Dialog>
);
