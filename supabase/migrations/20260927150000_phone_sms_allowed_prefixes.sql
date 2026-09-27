-- Vérification SMS : France, outre-mer français sauf La Réunion et Mayotte,
-- Union européenne, Royaume-Uni, Suisse, Norvège, Islande, Liechtenstein,
-- Monaco, Andorre. +590 couvre Guadeloupe, Saint-Barthélemy et Saint-Martin.

INSERT INTO public.platform_settings (key, value)
VALUES (
  'phone_sms_country_prefixes',
  '"+33 +590 +596 +594 +508 +687 +689 +681 +49 +43 +32 +359 +357 +385 +45 +34 +372 +358 +30 +36 +353 +39 +371 +370 +352 +356 +31 +48 +351 +420 +40 +421 +386 +46 +44 +41 +47 +354 +423 +377 +376"'::jsonb
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = now();
