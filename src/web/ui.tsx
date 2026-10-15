export function Icon({
  name,
  size = 18,
}: {
  name:
    | 'upload'
    | 'arrow'
    | 'check'
    | 'shield'
    | 'download'
    | 'close'
    | 'file'
    | 'search'
    | 'warning'
    | 'book';
  size?: number;
}) {
  const paths = {
    upload: (
      <>
        <path d="M12 16V3m-5 5 5-5 5 5" />
        <path d="M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" />
      </>
    ),
    arrow: (
      <>
        <path d="M4 12h16m-6-6 6 6-6 6" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    shield: (
      <>
        <path d="m12 3 8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v13m-5-5 5 5 5-5" />
        <path d="M4 17v4h16v-4" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    file: (
      <>
        <path d="M14 3H5v18h14V8Z" />
        <path d="M14 3v5h5M8 12h8M8 16h6" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    warning: (
      <>
        <path d="m12 3 10 18H2Z" />
        <path d="M12 9v5m0 3v.1" />
      </>
    ),
    book: (
      <>
        <path d="M3 4h6l3 2 3-2h6v15h-6l-3 2-3-2H3Z" />
        <path d="M12 6v15" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export function Pagination({
  total,
  page,
  onChange,
  label,
}: {
  total: number;
  page: number;
  onChange: (page: number) => void;
  label: string;
}) {
  const pages = Math.ceil(total / 100);
  if (pages < 2) return null;
  return (
    <nav className="pagination" aria-label={label}>
      <button
        type="button"
        className="button button-subtle"
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
      >
        Previous
      </button>
      <span>
        Page {page + 1} of {pages}
      </span>
      <button
        type="button"
        className="button button-subtle"
        disabled={page + 1 >= pages}
        onClick={() => onChange(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}
