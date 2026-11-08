import { useEffect, useState } from 'react';
import {
  profilePhotoObjectPath,
  requestSignedProfilePhoto,
} from '@/lib/profilePhoto';

/** undefined : chargement. null : pas de photo affichable. */
export function useSignedProfilePhoto(stored: string): string | null | undefined {
  const path = profilePhotoObjectPath(stored);
  const [url, setUrl] = useState<string | null | undefined>(path ? undefined : null);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    let cancel = false;
    setUrl(undefined);
    void requestSignedProfilePhoto(stored).then((next) => {
      if (!cancel) setUrl(next);
    });
    return () => {
      cancel = true;
    };
  }, [stored, path]);

  return url;
}

export default function ProfilePhoto({
  src,
  alt = '',
  className = 'w-full h-full object-cover',
  width = 400,
  eager = false,
  initial = '',
  initialClassName = 'w-full h-full flex items-center justify-center font-bold',
}: {
  src: string;
  alt?: string;
  className?: string;
  width?: number;
  eager?: boolean;
  initial?: string;
  initialClassName?: string;
}) {
  const signed = useSignedProfilePhoto(src);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [signed]);

  if (!signed || broken) {
    if (signed === undefined && !broken) {
      return <div className={className} aria-hidden="true" />;
    }
    const letter = initial.trim().charAt(0).toUpperCase() || alt.trim().charAt(0).toUpperCase() || '?';
    return (
      <div className={initialClassName} aria-hidden="true">
        {letter}
      </div>
    );
  }

  return (
    <img
      src={signed}
      alt={alt}
      width={width}
      height={Math.round(width * 1.25)}
      sizes={`${width}px`}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={eager ? 'high' : undefined}
      className={className}
      onError={() => setBroken(true)}
    />
  );
}
