#!/bin/sh
# Lance un fichier SQL dans BEGIN … ROLLBACK. Rien ne reste en base.
# Usage :
#   sh supabase/tests/run_rollback_test.sh chemin/vers/test.sql
#
# Le fichier ne contient pas BEGIN ni ROLLBACK.
# Pour rendre un tableau, il termine par :
#   RAISE EXCEPTION 'AYPIK_RESULTS %', resultat;
# L'erreur annule la transaction.
#
# Exemple #121, cas 2 et 4 à 10.
# Comptes : A = test2, B = Suzanne, C = Sandrine.
# S'il y a deux test2, prendre le Fondateur 64 et le dire.
# Le SQL se met à leur place avec SET LOCAL ROLE authenticated,
# prépare l'offre dans la transaction, puis RAISE EXCEPTION 'AYPIK_RESULTS %'.
#   sh supabase/tests/run_rollback_test.sh fichier-des-cas-121.sql

set -eu

if [ $# -ne 1 ] || [ ! -f "$1" ]; then
  echo "usage: sh supabase/tests/run_rollback_test.sh fichier.sql" >&2
  exit 2
fi

root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
tmp=$(mktemp "${TMPDIR:-/tmp}/aypik-rollback.XXXXXX.sql")
trap 'rm -f "$tmp"' EXIT

{
  printf '%s\n' 'BEGIN;'
  cat "$1"
  printf '\n%s\n' 'ROLLBACK;'
} > "$tmp"

(
  cd "$root"
  supabase db query --linked --file "$tmp"
)
