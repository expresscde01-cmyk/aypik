import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { founderBenefitLifetimeDiscount } from '@/lib/founderCopy';

const PRIVILEGE_TONE = [
  'font-bold text-aypik-navy',
  'font-bold text-aypik-raspberry',
  'font-bold text-aypik-navy',
];

/** Gras partiel de l’encadré privilège, partagé par l’accueil et la carte membre. */
export function founderPrivilegeHighlight(text: string, phrases: unknown): ReactNode[] {
  const marks = Array.isArray(phrases)
    ? phrases.filter((phrase): phrase is string => typeof phrase === 'string' && phrase.length > 0)
    : [];
  const nodes: ReactNode[] = [];
  let rest = text;
  marks.forEach((phrase, index) => {
    const at = rest.indexOf(phrase);
    if (at < 0) return;
    if (at > 0) nodes.push(rest.slice(0, at));
    nodes.push(
      <strong key={phrase} className={PRIVILEGE_TONE[index] ?? 'font-bold text-aypik-navy'}>
        {phrase}
      </strong>
    );
    rest = rest.slice(at + phrase.length);
  });
  if (rest) nodes.push(rest);
  return nodes;
}

export function FounderPrivilegeHighlight() {
  const { t } = useTranslation();
  return (
    <>
      {founderPrivilegeHighlight(
        founderBenefitLifetimeDiscount(),
        t('landing.founderPrivilegeBold', { returnObjects: true })
      )}
    </>
  );
}
