/** "1–50 of 230 · ‹ Prev · Next ›" under an admin list (pages of `pageSize`, 1-based). */
export function Pager({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (page: number) => void }) {
  if (total <= pageSize && page === 1) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  const btn = "rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3 px-1 py-3 text-xs text-muted">
      <span>
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          ‹ Prev
        </button>
        <span>
          Page {page} of {pages}
        </span>
        <button type="button" className={btn} disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next ›
        </button>
      </div>
    </nav>
  );
}
