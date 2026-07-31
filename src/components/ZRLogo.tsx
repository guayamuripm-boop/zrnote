/**
 * The ZR isotype.
 *
 * The paths are the official ZR Mecademy mark, lifted verbatim from the brand
 * file so the shape stays faithful. The app used to fake it with the letters
 * "ZR" typed in Poppins inside a blue square, which is a different shape from
 * the real logo (the Z's diagonal cut and the R's split stem are the whole
 * point of the mark).
 *
 * Rendered inline as SVG rather than an <img> so it stays crisp at any size and
 * costs no extra request.
 */
export function ZRLogo({
  className = '',
  variant = 'boxed',
}: {
  className?: string;
  /** `boxed` = white mark on the brand blue square. `mark` = mark alone, takes currentColor. */
  variant?: 'boxed' | 'mark';
}) {
  // Native bounding box of the letters in the brand file.
  const monogram = (
    <>
      <polygon points="65.65 36.93 47.91 61.62 45.13 65.49 22.52 65.49 22.52 36.93 65.65 36.93" />
      <polygon points="111.56 36.93 111.56 48.25 99.76 65.49 67.23 113.02 67.22 113.02 66.65 113.86 47.61 141.58 22.52 141.58 22.52 125.06 30.79 113.02 51.97 82.16 63.43 65.49 83.06 36.93 111.56 36.93" />
      <path d="M111.57,113v28.56s-30.41-.25-46.4-.36l17.4-24.51L85.2,113Z" />
      <rect x="124.36" y="36.93" width="28.56" height="104.65" />
      <path d="M203.17,105.05c-1.25.69-2.55,1.28-2.55,1.28a35.62,35.62,0,0,1-4.76,1.75q12.55,16.76,25.12,33.49H185.26L167.47,118V79.76h17.85a7.17,7.17,0,0,0,7.1-6.18,6.37,6.37,0,0,0,.07-1v-.07a6.37,6.37,0,0,0-.07-1,7.18,7.18,0,0,0-7.1-6.18H167.47V36.92l20.1.07a36.06,36.06,0,0,1,17.7,5.61c11.84,7.64,14.91,19.85,15.53,22.62a37,37,0,0,1,.12,15.33,35.81,35.81,0,0,1-6.71,15A40.37,40.37,0,0,1,203.17,105.05Z" />
    </>
  );

  if (variant === 'mark') {
    return (
      <svg viewBox="18 32 208 114" className={className} fill="currentColor" aria-hidden="true">
        {monogram}
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="zr-logo-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1E4D96" />
          <stop offset="100%" stopColor="#3869B1" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="113" fill="url(#zr-logo-gradient)" />
      {/* Same transform the icon generator uses, so the app and the installed
          icon show the identical mark. */}
      <g fill="#fff" transform="translate(97.10 121.32) scale(1.6008)">
        {monogram}
      </g>
    </svg>
  );
}

export default ZRLogo;
