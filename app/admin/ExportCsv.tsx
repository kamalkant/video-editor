import { Icon } from "@/components/ui/Icon";
import type { ExportKind } from "@/lib/admin/exports";

/** A "⬇ Payments CSV" download link (GET /api/admin/export/<kind>.csv). */
export function ExportCsv({ kind, label }: { kind: ExportKind; label: string }) {
  return (
    <a
      href={`/api/admin/export/${kind}.csv`}
      download
      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-raised"
    >
      <Icon name="download" className="size-3.5" />
      {label}
    </a>
  );
}
