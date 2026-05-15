import { useState } from "react";
import { FileCode2, FileText, X } from "lucide-react";
import type { SourceOverlayView } from "../../workbench";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/ui/toggle-group";
import { IconButton, PanelKicker, SourceEditorShell } from "@/ui/visualizer";
import { VISUALIZER_TEST_IDS } from "@/test-ids";

export const sourceOverlayOpenChange = (open: boolean, onClose: () => void): void => {
  if (!open) onClose();
};

type OpenView = Extract<SourceOverlayView, { open: true }>;
type Mode = "snippet" | "full";

type OverlayCodeProps = {
  cacheKey: string;
  label: string;
  value: string;
  firstLineNumber: number;
  highlightedLineNumbers: readonly number[];
};

const OverlayCode = ({ cacheKey, label, value, firstLineNumber, highlightedLineNumbers }: OverlayCodeProps) => (
  <SourceEditorShell
    key={cacheKey}
    label={label}
    value={value}
    textareaTestId={VISUALIZER_TEST_IDS.source.snippet}
    className="h-full"
    textareaClassName="h-full min-h-full"
    readOnly
    firstLineNumber={firstLineNumber}
    highlightedLineNumbers={highlightedLineNumbers}
  />
);

const modeItemClass =
  "h-8 font-mono text-[11px] data-[state=on]:bg-(--vf-surface-raised) data-[state=on]:font-semibold data-[state=on]:text-foreground data-[state=on]:shadow-[0_1px_2px_oklch(0_0_0/0.35)]";

const SourceOverlayMode = ({
  mode,
  fullAvailable,
  onChange,
}: {
  mode: Mode;
  fullAvailable: boolean;
  onChange: (mode: Mode) => void;
}) => (
  <ToggleGroup
    type="single"
    value={mode}
    onValueChange={(value) => value && onChange(value as Mode)}
    aria-label="Source view mode"
    variant="outline"
    className="shrink-0"
  >
    <ToggleGroupItem
      value="snippet"
      data-testid={VISUALIZER_TEST_IDS.source.overlayModeSnippet}
      className={modeItemClass}
    >
      <FileCode2 data-icon="inline-start" aria-hidden="true" />
      Snippet
    </ToggleGroupItem>
    <ToggleGroupItem
      value="full"
      disabled={!fullAvailable}
      data-testid={VISUALIZER_TEST_IDS.source.overlayModeFull}
      className={modeItemClass}
    >
      <FileText data-icon="inline-start" aria-hidden="true" />
      Full file
    </ToggleGroupItem>
  </ToggleGroup>
);

const renderOverlayBody = (view: OpenView, mode: Mode) => {
  if (view.fallback) {
    return (
      <p
        className="h-full overflow-auto rounded-md border bg-(--vf-surface-soft) p-3 font-mono text-[11px] text-(--vf-text-muted)"
        data-testid={VISUALIZER_TEST_IDS.source.overlayFallback}
        data-fallback="true"
      >
        {view.fallback}
      </p>
    );
  }

  if (mode === "full" && view.fullSource) {
    const selected = view.lines.filter((line) => line.selected).map((line) => line.line);
    return (
      <OverlayCode
        cacheKey={`full:${view.fullSource.length}:${selected.join(",")}`}
        label="Source overlay full file"
        value={view.fullSource}
        firstLineNumber={1}
        highlightedLineNumbers={selected}
      />
    );
  }

  const firstLineNumber = view.lines[0]!.line;
  const highlighted = view.lines.filter((line) => line.selected).map((line) => line.line - firstLineNumber + 1);
  return (
    <OverlayCode
      cacheKey={`snippet:${firstLineNumber}:${view.lines.length}:${highlighted.join(",")}`}
      label="Source overlay snippet"
      value={view.lines.map((line) => line.code).join("\n")}
      firstLineNumber={firstLineNumber}
      highlightedLineNumbers={highlighted}
    />
  );
};

export const SourceOverlay = ({
  view,
  onClose,
}: {
  view: SourceOverlayView;
  onClose: () => void;
}) => {
  const [desiredMode, setDesiredMode] = useState<Mode>("snippet");
  const fullAvailable = view.open && Boolean(view.fullSource) && !view.fallback;
  const mode: Mode = desiredMode === "full" && fullAvailable ? "full" : "snippet";

  const handleOpenChange = (open: boolean) => {
    if (!open) setDesiredMode("snippet");
    sourceOverlayOpenChange(open, onClose);
  };

  return (
    <Dialog open={view.open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="grid h-[min(860px,calc(100vh-1.5rem))] max-h-[calc(100vh-1.5rem)] w-[min(1280px,calc(100vw-1.5rem))] max-w-[min(1280px,calc(100vw-1.5rem))] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden border bg-card p-0 sm:max-w-[min(1280px,calc(100vw-1.5rem))]"
        showCloseButton={false}
        data-testid={VISUALIZER_TEST_IDS.source.overlay}
      >
        {view.open ? (
          <>
            <DialogHeader className="border-b border-(--vf-border-soft) bg-(--vf-surface-soft) px-4 py-2.5">
              <div className="flex min-w-0 items-start gap-3">
                <div className="min-w-0 flex-1">
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
                <SourceOverlayMode mode={mode} fullAvailable={fullAvailable} onChange={setDesiredMode} />
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

            <div className="min-h-0 overflow-hidden bg-(--vf-bg) p-3.5">{renderOverlayBody(view, mode)}</div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
