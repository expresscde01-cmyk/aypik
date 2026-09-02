import { useEffect } from 'react';
import { mountBrandLockupCopyGuard } from '@/lib/brandCopyGuard';

/** Garde document : copie interdite sur .brand-lockup-no-copy uniquement. */
export default function BrandLockupCopyGuard() {
  useEffect(() => mountBrandLockupCopyGuard(), []);
  return null;
}
