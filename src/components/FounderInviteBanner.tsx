import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import {
  FOUNDER_INVITE_URL,
  dismissFounderInvite,
  founderInviteVariant,
  isDisplayedFounderNumber,
  isFounderInviteDismissed,
  parseFounderSlotSnapshot,
  type FounderSlotSnapshot,
} from '@/lib/founderInvite';

async function loadFounderSlots(): Promise<FounderSlotSnapshot> {
  try {
    const { data, error } = await supabase.rpc('get_founder_slot_status');
    if (error || data == null) return { known: false };
    return parseFounderSlotSnapshot(data);
  } catch {
    return { known: false };
  }
}

function InvitePhrase({ text, highlight }: { text: string; highlight: string }) {
  const at = highlight ? text.indexOf(highlight) : -1;
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <strong>{highlight}</strong>
      {text.slice(at + highlight.length)}
    </>
  );
}

async function copySiteLink(): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(FOUNDER_INVITE_URL);
      return true;
    }
  } catch {
    /* repli ci-dessous */
  }
  try {
    const input = document.createElement('textarea');
    input.value = FOUNDER_INVITE_URL;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    input.select();
    const ok = document.execCommand('copy');
    input.remove();
    return ok;
  } catch {
    return false;
  }
}

export default function FounderInviteBanner({
  founderNumber,
}: {
  founderNumber: number | null;
}) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(isFounderInviteDismissed);
  const [slots, setSlots] = useState<FounderSlotSnapshot>({ known: false });
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const showNumber = isDisplayedFounderNumber(founderNumber);

  useEffect(() => {
    if (dismissed || !showNumber) return;
    let active = true;
    void loadFounderSlots().then((next) => {
      if (!active) return;
      setSlots(next);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [dismissed, showNumber]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (dismissed || !showNumber || !ready || !slots.known) return null;
  const variant = founderInviteVariant(slots.remaining);
  if (variant === 'hidden') return null;

  const text = t(
    variant === 'scarce'
      ? slots.remaining === 1
        ? 'landing.founderInviteScarceOne'
        : 'landing.founderInviteScarce'
      : 'landing.founderInviteOpen',
    { number: founderNumber, count: slots.remaining }
  );

  const share = async () => {
    const mobile = window.matchMedia('(max-width: 639px)').matches;
    if (mobile && typeof navigator.share === 'function') {
      try {
        await navigator.share({ url: FOUNDER_INVITE_URL });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    if (await copySiteLink()) setCopied(true);
  };

  return (
    <div
      className="launch-ticker founder-invite-banner"
      role="region"
      aria-label={t('landing.founderInviteRegion')}
    >
      <p className="founder-invite-banner-copy">
        <InvitePhrase text={text} highlight={t('landing.founderInviteHighlight')} />
      </p>
      <div className="launch-ticker-actions">
        <button
          type="button"
          className="launch-ticker-btn founder-invite-banner-share"
          onClick={() => void share()}
        >
          {copied ? t('landing.founderInviteCopied') : t('landing.founderInviteAction')}
        </button>
        <button
          type="button"
          className="launch-ticker-btn"
          aria-label={t('common.closeAria')}
          title={t('common.closeAria')}
          onClick={() => {
            dismissFounderInvite();
            setDismissed(true);
          }}
        >
          <X className="w-3.5 h-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
