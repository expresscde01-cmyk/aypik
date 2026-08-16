import { supabase } from '@/lib/supabase';

export const TESTIMONIAL_MIN_LEN = 40;
export const TESTIMONIAL_MAX_LEN = 800;

export const TESTIMONIAL_CONSENT_LABEL =
  'J’autorise Aypik à diffuser mon témoignage et mon prénom sur le site web';

export type PublishedTestimonial = {
  id: string;
  first_name: string;
  subtitle: string;
  body: string;
  avatar_url: string | null;
  created_at: string;
};

export type MyTestimonial = {
  exists: boolean;
  id?: string;
  first_name?: string;
  subtitle?: string;
  body?: string;
  avatar_url?: string | null;
  is_published?: boolean;
  consent_given: boolean;
  consent_given_at: string | null;
  created_at?: string;
  can_submit: boolean;
};

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

export async function fetchPublishedTestimonials(): Promise<
  PublishedTestimonial[]
> {
  const { data, error } = await supabase.rpc('list_published_testimonials');
  if (error) throw error;
  if (!Array.isArray(data)) return [];
  return data
    .map((row) => {
      const r = asRecord(row);
      if (typeof r.id !== 'string' || typeof r.body !== 'string') return null;
      return {
        id: r.id,
        first_name: typeof r.first_name === 'string' ? r.first_name : 'Membre',
        subtitle: typeof r.subtitle === 'string' ? r.subtitle : '',
        body: r.body,
        avatar_url: typeof r.avatar_url === 'string' ? r.avatar_url : null,
        created_at: typeof r.created_at === 'string' ? r.created_at : '',
      };
    })
    .filter((row): row is PublishedTestimonial => row !== null);
}

export async function fetchMyTestimonial(): Promise<MyTestimonial | null> {
  const { data, error } = await supabase.rpc('get_my_testimonial');
  if (error) throw error;
  const r = asRecord(data);
  return {
    exists: r.exists === true,
    id: typeof r.id === 'string' ? r.id : undefined,
    first_name: typeof r.first_name === 'string' ? r.first_name : undefined,
    subtitle: typeof r.subtitle === 'string' ? r.subtitle : undefined,
    body: typeof r.body === 'string' ? r.body : undefined,
    avatar_url: typeof r.avatar_url === 'string' ? r.avatar_url : null,
    is_published: r.is_published === true,
    consent_given: r.consent_given === true,
    consent_given_at:
      typeof r.consent_given_at === 'string' ? r.consent_given_at : null,
    created_at: typeof r.created_at === 'string' ? r.created_at : undefined,
    can_submit: r.can_submit === true,
  };
}

export async function submitPaidTestimonial(input: {
  body: string;
  consent: boolean;
  includeAvatar: boolean;
}): Promise<string | null> {
  const { error } = await supabase.rpc('submit_paid_testimonial', {
    p_body: input.body,
    p_consent: input.consent,
    p_include_avatar: input.includeAvatar,
  });
  if (!error) return null;
  return error.message;
}

export async function withdrawMyTestimonial(): Promise<string | null> {
  const { error } = await supabase.rpc('withdraw_my_testimonial');
  if (!error) return null;
  return error.message;
}
