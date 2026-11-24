/** Not Nine Bar's mark: a 9 struck through, black on yellow (paths, so it looks the same everywhere) */
export const BRAND_MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="14" fill="#ffc400"/>
<g fill="none" stroke="#0a0a0a" stroke-width="8" stroke-linecap="round">
<circle cx="31" cy="24" r="12"/>
<path d="M43 24 C43 42 37 52 22 53"/>
</g>
<path d="M12 57 L52 7" stroke="#ffc400" stroke-width="9" stroke-linecap="round"/>
<path d="M12 57 L52 7" stroke="#0a0a0a" stroke-width="4" stroke-linecap="round"/>
</svg>`;

export function BrandMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <span className={`inline-block shrink-0 ${className}`} role="img" aria-label="Not Nine Bar"
      // Same drawing as the app icons (public/icon.svg)
      dangerouslySetInnerHTML={{ __html: BRAND_MARK_SVG.replace("<svg ", '<svg width="100%" height="100%" ') }} />
  );
}
