import { supabase } from '@/lib/supabase';

/**
 * Test rapide : lit `payment_subscriptions` via le client anon + session.
 * À lancer dans la console navigateur (DEV) : `__testPaymentSubs()`
 * Prérequis : être connecté (RLS = auth.uid() = user_id).
 */
export async function testPaymentSubscriptionsFetch() {
  console.group('[debug] payment_subscriptions');

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.error('auth error:', authError.message);
    console.groupEnd();
    return { data: null, error: authError };
  }

  if (!user) {
    console.warn('Aucun utilisateur connecté — RLS bloquera la lecture.');
    console.groupEnd();
    return { data: null, error: new Error('not authenticated') };
  }

  console.log('user_id:', user.id);

  const { data, error, status, statusText } = await supabase
    .from('payment_subscriptions')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('fetch error:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      status,
      statusText,
    });
    console.groupEnd();
    return { data: null, error };
  }

  console.log(`OK — ${data?.length ?? 0} ligne(s)`);
  if (data && data.length > 0) {
    console.table(data);
  } else {
    console.log(
      'Table accessible, mais aucune ligne pour cet utilisateur (normal si aucun abonnement).'
    );
  }

  console.groupEnd();
  return { data, error: null };
}

if (import.meta.env.DEV) {
  (window as unknown as { __testPaymentSubs: typeof testPaymentSubscriptionsFetch })
    .__testPaymentSubs = testPaymentSubscriptionsFetch;
}
