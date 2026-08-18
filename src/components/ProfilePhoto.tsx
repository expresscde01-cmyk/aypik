import { useState } from 'react';
import { profilePhotoSrc } from '@/lib/profilePhoto';

export default function ProfilePhoto({
  src,
  alt = '',
  className = 'w-full h-full object-cover',
  width = 400,
  eager = false,
}: {
  src: string;
  alt?: string;
  className?: string;
  width?: number;
  eager?: boolean;
}) {
  const [useOriginal, setUseOriginal] = useState(false);
  const optimized = useOriginal ? src : profilePhotoSrc(src, width);

  return (
    <img
      src={optimized}
      alt={alt}
      width={width}
      height={Math.round(width * 1.25)}
      sizes={`${width}px`}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={eager ? 'high' : undefined}
      className={className}
      onError={() => {
        if (!useOriginal && optimized !== src) setUseOriginal(true);
      }}
    />
  );
}
