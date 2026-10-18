import { Video } from 'lucide-react';
import { useState, type CSSProperties, type MouseEventHandler } from 'react';
import { getVideoPosterUrl } from '@/core/media/video-poster-url';

/** A poster must never fall back to mounting or downloading the original video. */
export function CachedVideoPoster({
  src, alt = '', className = 'nowheel', style, onDoubleClick,
}: {
  src: string | null;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  onDoubleClick?: MouseEventHandler<HTMLDivElement>;
}) {
  const posterUrl = getVideoPosterUrl(src);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <div
      data-video-poster
      className={className}
      onDoubleClick={onDoubleClick}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', ...style }}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center bg-[var(--beat-surface-2)] text-[var(--beat-text-3)]">
        <Video className="size-6" />
      </div>
      {posterUrl && failedUrl !== posterUrl ? (
        <img
          src={posterUrl}
          alt={alt}
          draggable={false}
          loading="lazy"
          decoding="async"
          onError={() => setFailedUrl(posterUrl)}
          className="nowheel relative block size-full"
          style={{ objectFit: style?.objectFit ?? 'cover' }}
        />
      ) : <span className="sr-only">{alt}</span>}
    </div>
  );
}
