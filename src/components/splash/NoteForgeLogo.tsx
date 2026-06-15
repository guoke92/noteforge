/** Brand mark for splash / welcome — matches TopBar accent tile. */
export function NoteForgeLogo({ size = 72 }: { size?: number }) {
  const id = "nf-logo-glow";
  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <div className="absolute inset-0 animate-splash-glow rounded-2xl bg-accent/20 blur-xl" />
      <svg
        width={size}
        height={size}
        viewBox="0 0 72 72"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative drop-shadow-md"
      >
        <defs>
          <linearGradient id={id} x1="12" y1="8" x2="60" y2="64" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--color-accent)" />
            <stop offset="1" stopColor="var(--color-accent-hover)" />
          </linearGradient>
        </defs>
        <rect x="4" y="4" width="64" height="64" rx="16" fill={`url(#${id})`} />
        <path
          d="M22 48V24h8.5l7.5 14.2L45.5 24H54v24h-7V35.8L40 48h-3.8L25 35.8V48H22z"
          fill="white"
          fillOpacity="0.96"
        />
        <rect
          x="4"
          y="4"
          width="64"
          height="64"
          rx="16"
          stroke="white"
          strokeOpacity="0.12"
          strokeWidth="1"
        />
      </svg>
    </div>
  );
}
