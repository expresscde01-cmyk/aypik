import { ArrowLeft } from 'lucide-react';

/** Lien retour Accueil — style pilule rose (référence Découvrir). */
export default function HomeBackButton({
  onClick,
  className = '',
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`home-back-button inline-flex items-center gap-1.5 h-8 pl-1 pr-2.5 rounded-full text-[13px] font-semibold transition-colors ${className}`}
      aria-label="Retour à l’accueil"
    >
      <span className="home-back-button__glyph w-6 h-6 rounded-full flex items-center justify-center">
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
      </span>
      Accueil
    </button>
  );
}
