"use client";

type TablePaginationProps = {
  totalRecords?: number;
  totalItems?: number;
  page: number;
  pageSize: number;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange?: (nextPageSize: number) => void;
  pageSizeOptions?: number[];
  itemLabel?: string;
};

export function paginateSlice<T>(items: T[], page: number, pageSize: number): T[] {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = (safePage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function TablePagination({
  totalRecords,
  totalItems,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [4, 6, 8, 10, 20],
  itemLabel = "records",
}: TablePaginationProps) {
  const count = totalRecords ?? totalItems ?? 0;
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const startRecord = count === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endRecord = Math.min(safePage * pageSize, count);

  return (
    <div className="list-pagination-bar">
      <div className="pagination-meta-group">
        <span>
          Showing{" "}
          <b>
            {startRecord}–{endRecord}
          </b>{" "}
          of <b>{count}</b> {itemLabel}
        </span>
        {onPageSizeChange && (
          <label className="page-size-label">
            Rows:
            <select
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(1);
              }}
              aria-label={`Rows per page for ${itemLabel}`}
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt} / page
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="pagination-buttons">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
        >
          ← Prev
        </button>
        {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pNum) => (
          <button
            key={pNum}
            type="button"
            className={pNum === safePage ? "active" : ""}
            onClick={() => onPageChange(pNum)}
          >
            {pNum}
          </button>
        ))}
        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
