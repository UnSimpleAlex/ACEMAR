import { useState } from "react";
import { Package } from "lucide-react";

export function ProductImage({
  src,
  name,
}: {
  src: string | null;
  name: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return (
    <div className="product-image">
      {src && failedSrc !== src ? (
        <img
          src={src}
          alt={name}
          loading="lazy"
          decoding="async"
          width="240"
          height="160"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <span role="img" aria-label={`Sin imagen disponible de ${name}`}>
          <Package size={52} strokeWidth={1.3} aria-hidden="true" />
        </span>
      )}
    </div>
  );
}
