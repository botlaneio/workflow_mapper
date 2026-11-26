import { siGmail, siGooglesheets, siWhatsapp, type SimpleIcon } from "simple-icons";

const BRANDS: Record<string, SimpleIcon> = {
  whatsapp: siWhatsapp,
  gmail: siGmail,
  sheets: siGooglesheets,
};

export function BrandMark({ id, size = 14 }: { id: string; size?: number }) {
  const icon = BRANDS[id];
  if (!icon) return null;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-label={icon.title}>
      <path fill={`#${icon.hex}`} d={icon.path} />
    </svg>
  );
}
