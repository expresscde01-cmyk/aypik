import { useEffect, useState } from 'react';
import { Quote } from 'lucide-react';
import { SITE_FREE_MODE } from '@/lib/founderCopy';
import {
  fetchPublishedTestimonials,
  type PublishedTestimonial,
} from '@/lib/testimonials';

function initials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return 'A';
  return trimmed.slice(0, 1).toUpperCase();
}

function TestimonialCard({ item }: { item: PublishedTestimonial }) {
  return (
    <article className="flex h-full flex-col rounded-3xl border border-rose-100 bg-white/80 p-5 shadow-sm shadow-rose-100/60">
      <Quote className="h-5 w-5 text-rose-300" aria-hidden />
      <p className="mt-3 flex-1 text-sm leading-relaxed text-gray-700 text-pretty">
        {item.body}
      </p>
      <div className="mt-5 flex items-center gap-3">
        {item.avatar_url ? (
          <img
            src={item.avatar_url}
            alt=""
            className="h-10 w-10 rounded-full object-cover border border-rose-100"
          />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-amber-400 text-sm font-bold text-white">
            {initials(item.first_name)}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">
            {item.first_name}
          </p>
          {item.subtitle ? (
            <p className="text-xs text-gray-500">{item.subtitle}</p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default function TestimonialsSection({
  variant = 'landing',
}: {
  variant?: 'landing' | 'app';
}) {
  const [items, setItems] = useState<PublishedTestimonial[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (SITE_FREE_MODE) return;
    let active = true;
    (async () => {
      try {
        const list = await fetchPublishedTestimonials();
        if (active) setItems(list);
      } catch {
        if (active) setItems([]);
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (SITE_FREE_MODE) return null;
  if (!loaded || items.length === 0) return null;

  return (
    <section
      id="temoignages"
      className={
        variant === 'landing'
          ? 'max-w-3xl mx-auto w-full px-4 pb-14 sm:pb-16'
          : 'space-y-4'
      }
    >
      <div className={variant === 'landing' ? 'mb-8 text-center' : ''}>
        <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">
          Ils ont choisi Aypik
        </h2>
        <p className="mt-2 text-sm text-gray-500 leading-relaxed">
          Paroles de membres Premium, publiées avec leur consentement.
        </p>
      </div>
      <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 no-scrollbar sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 lg:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="min-w-[85%] snap-center sm:min-w-0"
          >
            <TestimonialCard item={item} />
          </div>
        ))}
      </div>
    </section>
  );
}
