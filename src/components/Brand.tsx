import { Network } from "lucide-react";

interface BrandProps {
  compact?: boolean;
}

export function Brand({ compact = false }: BrandProps) {
  return (
    <div className={`brand${compact ? " is-compact" : ""}`} aria-label="Annota">
      <span className="brand-mark" aria-hidden="true">
        <Network size={17} />
      </span>
      <span className="brand-copy">
        <strong>Annota</strong>
        {!compact && <small>本地知识树</small>}
      </span>
    </div>
  );
}
