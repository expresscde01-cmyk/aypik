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
      className={`inline-flex items-center gap-1.5 h-8 pl-1 pr-2.5 rounded-full bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 text-[13px] font-semibold transition-colors ${className}`}
      aria-label="Retour à l’accueil"
    >
      <span className="w-6 h-6 rounded-full bg-white text-rose-500 flex items-center justify-center shadow-sm shadow-rose-100">
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
      </span>
      Accueil
    </button>
  );
}
