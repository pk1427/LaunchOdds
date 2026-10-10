export function LogoMark({ size = 28 }: { size?: number }) {
  // Original mark: three ascending bars with an arrowhead — "storyscore".
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      role="presentation"
    >
      <rect x="4" y="18" width="5" height="10" rx="1.5" fill="#0891B2" opacity="0.75" />
      <rect x="11.5" y="12" width="5" height="16" rx="1.5" fill="#2563EB" />
      <rect x="19" y="6" width="5" height="22" rx="1.5" fill="#2563EB" opacity="0.55" />
      <path
        d="M5 9 L13 3 L11 3 M13 3 L13 8"
        stroke="#34d399"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
