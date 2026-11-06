import { Check, Loader2 } from 'lucide-react';

export type ProfileSaveCue = 'idle' | 'success' | 'leaving';

export default function ProfileSaveIcon({
  saving,
  cue,
}: {
  saving: boolean;
  cue: ProfileSaveCue;
}) {
  if (saving) {
    return <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />;
  }
  const phase =
    cue === 'success'
      ? ' profile-save-check--success'
      : cue === 'leaving'
        ? ' profile-save-check--leaving'
        : '';
  return (
    <span className={`profile-save-check${phase}`} aria-hidden="true">
      <Check className="h-4 w-4" />
    </span>
  );
}
