import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BRAND_NAME, BRAND_BASELINE } from '@/components/BrandLockup';
import { FOUNDER_MAX_SLOTS, SITE_FREE_MODE } from '@/lib/founderCopy';
import { useFounderSlots } from '@/lib/useFounderSlots';
import {
  ContactLink,
  SUPPORT_EMAIL,
  legalDocLabel,
} from '@/components/LegalChrome';
import LegalMarkdown from '@/components/LegalMarkdown';
import LaunchTicker from '@/components/LaunchTicker';
import LegalTranslationBanner from '@/components/LegalTranslationBanner';
import LanguageSwitcher from '@/i18n/LanguageSwitcher';
import { currentLocale } from '@/i18n/documentMeta';
import termsEn from '@/content/legal/terms-en.md?raw';
import termsEs from '@/content/legal/terms-es.md?raw';

export {
  CONTACT_PATH,
  ContactLink,
  LEGAL_DOC_LABEL,
  LegalLink,
  SUPPORT_EMAIL,
  SiteFooter,
  closeLegalTerms,
  isContactPage,
  isLegalTermsOpen,
  openLegalTerms,
} from '@/components/LegalChrome';

export default function LegalTermsPage({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const locale = currentLocale();
  const docLabel = legalDocLabel();
  const { closed: founderOfferClosed } = useFounderSlots();
  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-amber-50">
      <div className="sticky top-0 z-20">
      <header className="bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-500"
            aria-label={t('legal.back')}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-gray-900 text-sm sm:text-base flex-1">
            {docLabel}
          </h1>
          <LanguageSwitcher compact />
        </div>
      </header>
      <LaunchTicker />
      {locale !== 'fr' && <LegalTranslationBanner variant="stack" />}
      </div>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {locale !== 'fr' ? (
          <article
            lang={locale}
            className="bg-white rounded-3xl border border-rose-100 shadow-xl shadow-rose-100/40 p-6 sm:p-8 space-y-8 text-sm text-gray-700 leading-relaxed"
          >
            <LegalMarkdown
              source={locale === 'es' ? termsEs : termsEn}
              locale={locale}
              founderOfferClosed={founderOfferClosed}
            />
          </article>
        ) : (
        <article
          lang="fr"
          className="bg-white rounded-3xl border border-rose-100 shadow-xl shadow-rose-100/40 p-6 sm:p-8 space-y-8 text-sm text-gray-700 leading-relaxed"
        >
          <header className="space-y-2 border-b border-gray-100 pb-6">
            <p className="inline-flex items-baseline gap-1.5 text-[10px]">
              <span
                className="font-extrabold uppercase tracking-[0.22em]"
                style={{ color: '#C71585' }}
              >
                {BRAND_NAME}
              </span>
              <span className="text-xs font-light tracking-wide text-gray-600">
                <span className="mr-1" aria-hidden>
                  —
                </span>
                {BRAND_BASELINE}
              </span>
            </p>
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">
              Conditions Générales d&apos;Utilisation
            </h2>
            <p className="text-xs text-gray-500">
              Dernière mise à jour : 20 septembre 2026.
            </p>
          </header>

          <section className="space-y-2">
            <h3 className="text-base font-bold text-gray-900">Préambule</h3>
            <p>
              {BRAND_NAME} est une plateforme de rencontre en ligne dédiée
              exclusivement aux personnes majeures n&apos;ayant pas
              d&apos;enfants. Elle est éditée à titre personnel, dans le cadre
              d&apos;un projet indépendant. L&apos;inscription, la création et
              la gestion d&apos;un profil, la découverte de membres,
              l&apos;expression d&apos;un intérêt (Like, Flash) et la
              constitution de Matchs restent accessibles sans contrepartie
              financière, dans les conditions précisées à l&apos;article 2.3.
            </p>
            <p>
              Le Service repose sur la transparence : pas de pratiques
              trompeuses, pas d&apos;engagement caché, pas de carte bancaire
              exigée pour s&apos;inscrire ou pour utiliser les
              fonctionnalités gratuites décrites à l&apos;article 2.3.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-bold text-gray-900">
              Article 1 — Mentions légales (LCEN)
            </h3>
            <p>
              Conformément à la loi n° 2004-575 du 21 juin 2004 pour la
              confiance dans l&apos;économie numérique (LCEN), les présentes
              mentions identifient l&apos;éditeur du Service et
              l&apos;hébergeur.
            </p>
            <div>
              <p className="font-semibold text-gray-900">Éditeur du Service</p>
              <p>
                Le site {BRAND_NAME} (accessible notamment à l&apos;adresse{' '}
                <a
                  href="https://aypik.fr"
                  className="underline underline-offset-2 hover:text-rose-600"
                >
                  https://aypik.fr
                </a>
                ) est édité par une personne physique agissant à titre non
                professionnel, dans le cadre d&apos;un projet bénévole.
              </p>
              <p>
                Directeur de la publication : le fondateur d&apos;{BRAND_NAME},
                personne physique, joignable à l&apos;adresse{' '}
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-rose-600"
                >
                  {SUPPORT_EMAIL}
                </a>
                .
              </p>
              <p>
                En application de l&apos;article 6, III de la LCEN, dès lors
                que l&apos;édition s&apos;effectue à titre non professionnel,
                l&apos;éditeur peut limiter la publication de ses éléments
                d&apos;identification personnelle, sous réserve de les avoir
                communiqués à l&apos;hébergeur. Toute réclamation, demande
                d&apos;exercice des droits ou signalement peut être adressé à
                l&apos;adresse e-mail ci-dessus.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Hébergeur</p>
              <p>
                o2switch, SAS au capital de 100&nbsp;000&nbsp;euros
                <br />
                Chemin des Pardiaux, 63000 Clermont-Ferrand, France
                <br />
                RCS Clermont-Ferrand 510&nbsp;909&nbsp;807
                <br />
                SIRET 510&nbsp;909&nbsp;807&nbsp;00032
                <br />
                TVA intra-communautaire FR35&nbsp;510&nbsp;909&nbsp;807
                <br />
                Site :{' '}
                <a
                  href="https://www.o2switch.fr"
                  className="underline underline-offset-2 hover:text-rose-600"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  https://www.o2switch.fr
                </a>
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-bold text-gray-900">
              Article 2 — Objet, acceptation et évolution du modèle
            </h3>
            <div>
              <p className="font-semibold text-gray-900">2.1 Objet</p>
              <p>
                Les présentes Conditions Générales d&apos;Utilisation (ci-après
                les « CGU ») ont pour objet de définir les conditions
                d&apos;accès et d&apos;utilisation du Service {BRAND_NAME} :
                création de profil, découverte de membres, expressions
                d&apos;intérêt (Like, Flash), constitution de Matchs,
                accès à la messagerie (mode Dialogue) selon l&apos;offre
                souscrite par l&apos;expéditeur et, le cas échéant, sous
                réserve de l&apos;existence d&apos;un Match lorsque le
                profil du destinataire relève d&apos;une offre garantissant
                sa non-sollicitation sans réciprocité (Confort, Premium,
                ou Membre Fondateur pendant sa Période d&apos;essai), sauf
                si ce destinataire a lui-même activé le mode Simplifié
                (annexe « Messagerie et consentement »), à
                l&apos;issue de sa Période d&apos;essai (article 4)
                {!SITE_FREE_MODE && (
                  <>, à la souscription d&apos;une offre payante active</>
                )}
                , ainsi que
                paramètres de visibilité du compte.
              </p>
              {!SITE_FREE_MODE && (
              <p>
                Les présentes CGU ne constituent pas des conditions générales
                de vente. Les éventuelles offres payantes, notamment celle
                permettant l&apos;envoi de messages à l&apos;issue de la
                Période d&apos;essai visée à l&apos;article 4, font
                l&apos;objet de Conditions Générales de Vente (CGV)
                distinctes, visées à l&apos;article 2.4.
              </p>
              )}
            </div>
            <div>
              <p className="font-semibold text-gray-900">2.2 Acceptation</p>
              <p>
                L&apos;inscription, la création d&apos;un compte ou
                l&apos;utilisation du Service emportent acceptation pleine et
                entière des présentes CGU. Si l&apos;utilisateur n&apos;accepte
                pas ces conditions, il doit s&apos;abstenir d&apos;utiliser le
                Service et peut demander la suppression de son compte.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                2.3 Fonctionnalités accessibles gratuitement
              </p>
              <p>
                Restent accessibles gratuitement, sans obligation de paiement
                ni de carte bancaire : la création et la gestion d&apos;un
                profil, la consultation des profils compatibles proposés dans
                Découvrir et les suggestions, l&apos;expression d&apos;un
                intérêt (Like, Flash) et la constitution de Matchs.
              </p>
              {SITE_FREE_MODE ? (
              <p>
                L&apos;envoi de messages (mode Dialogue) est inclus
                pendant la Période d&apos;essai définie à l&apos;article 4
                (six mois pour un Membre Fondateur, une semaine pour tout
                autre utilisateur), décomptée individuellement pour chaque
                utilisateur à compter de la création de son compte. Aucune
                souscription payante n&apos;est proposée ni exigée tant que
                le Service est en phase de lancement.
              </p>
              ) : (
              <>
              <p>
                L&apos;envoi de messages (mode Dialogue) est inclus
                gratuitement pendant la Période d&apos;essai définie à
                l&apos;article 4 (six mois pour un Membre Fondateur, une
                semaine pour tout autre utilisateur), décomptée
                individuellement pour chaque utilisateur à compter de la
                création de son compte. Cette fenêtre n&apos;est pas
                renouvelable. Au-delà, l&apos;envoi de nouveaux messages
                est réservé aux utilisateurs disposant d&apos;un
                abonnement actif (Basique, Essentiel, Confort ou Premium),
                dans les conditions et selon les tarifs précisés par les
                Conditions Générales de Vente (CGV) visées à l&apos;article
                2.4. L&apos;ouverture d&apos;un Dialogue sans Match dépend
                du destinataire (profil ouvert ou protégé), selon
                l&apos;article 2.1.
              </p>
              <p>
                La consultation des Matchs déjà formés et des messages déjà
                reçus demeure accessible sans paiement. L&apos;utilisateur
                qui ne souhaite pas souscrire d&apos;abonnement conserve un
                accès complet à la création de profil, à la découverte, au
                Like, au Flash et à la constitution de Matchs ; seul
                l&apos;envoi de nouveaux messages, à l&apos;issue de sa
                Période d&apos;essai (article 4), est concerné par cette
                condition.
              </p>
              </>
              )}
            </div>
            {!SITE_FREE_MODE && (
            <div>
              <p className="font-semibold text-gray-900">2.4 Offres payantes</p>
              <p>
                À l&apos;issue de la Période d&apos;essai visée à
                l&apos;article 4, l&apos;éditeur propose ou pourra proposer
                des offres payantes, notamment pour permettre l&apos;envoi de
                messages illimité, ainsi que, le cas échéant, des
                fonctionnalités de confort ou de visibilité accrue.
              </p>
              <p>
                Le cas échéant :
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  les utilisateurs en sont informés préalablement, de
                  manière claire et distincte ;
                </li>
                <li>
                  ces offres font l&apos;objet de Conditions Générales de
                  Vente (CGV) distinctes des présentes CGU, portées à la
                  connaissance de l&apos;utilisateur et acceptées
                  expressément avant toute souscription et tout paiement ;
                </li>
                <li>
                  Refuser de payer ne ferme pas le compte : l&apos;utilisateur
                  conserve l&apos;accès à son profil, à Découvrir, à
                  l&apos;expression d&apos;un intérêt (Like, Flash) et à la
                  constitution de Matchs. Après l&apos;essai, cela limite
                  seulement l&apos;envoi de nouveaux messages.
                </li>
              </ul>
              <p>
                Tant que des CGV afférentes à une offre payante n&apos;ont
                pas été publiées et acceptées par l&apos;utilisateur, aucun
                paiement ne lui est demandé au titre de cette offre.
              </p>
            </div>
            )}
            <div>
              <p className="font-semibold text-gray-900">
                2.5 Modification des CGU
              </p>
              <p>
                L&apos;éditeur peut modifier les présentes CGU pour des motifs
                légitimes (évolution légale, technique ou du Service). La
                version applicable est celle publiée sur le Site, datée. En cas
                de modification substantielle, une information sera portée à
                la connaissance des utilisateurs. La poursuite de
                l&apos;utilisation du Service après entrée en vigueur vaut
                acceptation, sans préjudice du droit de supprimer son compte.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-bold text-gray-900">
              Article 3 — Conditions d&apos;accès
            </h3>
            <p>
              Aux fins des présentes, les termes « site » et
              « application » désignent le même Service {BRAND_NAME},
              accessible via un navigateur à l&apos;adresse{' '}
              <a
                href="https://aypik.fr"
                className="underline underline-offset-2 hover:text-rose-600"
              >
                https://aypik.fr
              </a>{' '}
              ou installé sur un appareil (application web progressive,
              ou PWA).
            </p>
            <p>
              L&apos;utilisateur peut, lorsque le navigateur le permet,
              ajouter le Service à l&apos;écran d&apos;accueil d&apos;un
              téléphone ou d&apos;une tablette, ou au bureau d&apos;un
              ordinateur. Cette installation est proposée de manière directe
              sous Android, dans les navigateurs Chrome et Samsung Internet,
              ainsi que sur ordinateur, dans les navigateurs Chrome et Edge.
              Elle est également possible, en suivant les instructions
              affichées sur le Service, sur iPhone et iPad dans le
              navigateur Safari, sous Firefox pour Android, et sous Safari
              pour macOS à compter de la version Sonoma. Elle n&apos;est pas
              proposée sous Firefox pour ordinateur, ni sous les autres
              navigateurs ne disposant pas d&apos;une option d&apos;ajout
              équivalente.
            </p>
            <p>
              Dans tous les cas, y compris lorsque cette installation
              n&apos;est pas proposée, l&apos;accès au Service via le
              navigateur, à l&apos;adresse{' '}
              <a
                href="https://aypik.fr"
                className="underline underline-offset-2 hover:text-rose-600"
              >
                https://aypik.fr
              </a>, demeure entièrement disponible et inchangé.
              L&apos;installation n&apos;est qu&apos;un raccourci d&apos;accès
              optionnel ; elle n&apos;est jamais une condition d&apos;accès au
              Service, n&apos;en modifie ni le fonctionnement, ni les données
              associées au compte, ni les présentes conditions, et ne donne
              lieu à aucune collecte de données supplémentaire par rapport à
              l&apos;usage via navigateur. Le Service n&apos;étant pas
              distribué via Google Play ou l&apos;App Store, aucune condition
              d&apos;utilisation tierce de ces plateformes ne s&apos;applique.
            </p>
            <div>
              <p className="font-semibold text-gray-900">
                3.1 Majorité — 18 ans révolus
              </p>
              <p>
                Le Service est exclusivement réservé aux personnes majeures.
                Toute inscription, tout accès et toute utilisation par une
                personne âgée de moins de 18 ans sont strictement interdits.
              </p>
              <p>
                En s&apos;inscrivant, l&apos;utilisateur déclare et garantit
                avoir 18 ans révolus à la date de création du compte. Une
                date de naissance est exigée ; l&apos;accès est refusé si
                l&apos;âge déclaré est inférieur à 18 ans.
              </p>
              <p>
                L&apos;éditeur se réserve le droit de refuser, suspendre ou
                supprimer, sans préavis, tout compte dont le titulaire
                s&apos;avérerait mineur ou aurait fourni une date de
                naissance inexacte afin de contourner cette interdiction.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                3.2 Public du Service
              </p>
              <p>
                Le Service s&apos;adresse aux personnes majeures se déclarant
                sans enfant. L&apos;utilisateur s&apos;engage à renseigner un
                profil sincère à cet égard. Un profil manifestement
                incompatible avec cette orientation éditoriale pourra être
                suspendu ou supprimé.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                3.3 Unicité des comptes
              </p>
              <p>
                Chaque utilisateur ne peut détenir qu&apos;un seul et unique
                compte. La création, la détention ou l&apos;usage, simultané
                ou successif en fraude de la présente règle, de plusieurs
                comptes par une même personne physique est interdit.
              </p>
              <p>
                L&apos;ouverture d&apos;un compte est liée à une seule
                adresse e-mail, identifiant unique du compte. Il est interdit
                de créer plusieurs comptes à partir d&apos;une même adresse
                e-mail, ou plusieurs comptes pour une même personne, y
                compris au moyen d&apos;adresses distinctes.
              </p>
              <p>
                L&apos;éditeur peut refuser l&apos;inscription, suspendre ou
                supprimer, sans préavis ni indemnité, tout compte constituant
                un doublon, une multi-détention ou une tentative de
                contournement. L&apos;utilisateur ne saurait alors prétendre
                à aucun dédommagement ni au transfert d&apos;avantages,
                y compris le statut de Membre Fondateur et le numéro qui y
                est attaché.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                3.4 Bienveillance et modération
              </p>
              <p>
                Les utilisateurs s&apos;engagent à un usage loyal, respectueux
                et bienveillant : pas de harcèlement, d&apos;injures, de
                propos haineux, de contenus illicites, d&apos;usurpation
                d&apos;identité, de sollicitations commerciales non
                autorisées, ni de comportement tendant à compromettre la
                sécurité d&apos;autrui.
              </p>
              <p>
                L&apos;ouverture d&apos;un Dialogue sans Match n&apos;est
                possible que lorsque le profil du destinataire est ouvert,
                dans les conditions de l&apos;article 2.1 et de l&apos;annexe
                « Messagerie et consentement ». Un Match, lorsqu&apos;il
                existe, ouvre toujours le Dialogue. Le Like demeure discret
                jusqu&apos;à réciprocité. Les délais et libellés liés aux
                profils mis en attente, ainsi qu&apos;aux statuts « 1er mot »
                et « Discussion en cours », sont précisés à l&apos;Annexe A
                (Glossaire), dans un souci de transparence et afin
                d&apos;éviter toute ambiguïté sur la clôture des interactions.
              </p>
              <p>
                L&apos;éditeur, dans le cadre d&apos;une obligation de
                moyens, peut modérer, masquer ou supprimer un contenu, et
                avertir, suspendre ou supprimer un compte, sans préavis
                lorsque la gravité des faits le justifie. Un signalement peut
                être adressé à {SUPPORT_EMAIL}.
              </p>
              <p>
                L&apos;utilisateur dont le compte a été suspendu ou
                supprimé pour manquement aux présentes CGU peut contester
                cette décision en écrivant à {SUPPORT_EMAIL}, en exposant
                les éléments qu&apos;il souhaite voir pris en compte.
                L&apos;éditeur examine cette contestation dans un délai
                raisonnable.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                3.5 Critères de mise en relation
              </p>
              <p>
                Les profils proposés sur Découvrir et dans les suggestions
                de l&apos;Accueil sont sélectionnés selon des critères
                permanents, indépendants de l&apos;offre souscrite :
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  le genre (homme ou femme), renseigné obligatoirement à
                  l&apos;inscription : un compte « homme » se voit proposer
                  des profils « femme », et réciproquement ;
                </li>
                <li>
                  un écart d&apos;âge raisonnable entre les deux membres, apprécié dans
                  les deux sens, sans qu&apos;un profil mineur puisse jamais
                  être proposé (le Service est réservé aux personnes
                  majeures, article 3.1) ;
                </li>
                <li>
                  uniquement des profils de personnes sans enfants,
                  conformément à l&apos;objet du Service.
                </li>
              </ul>
              <p>
                D&apos;autres filtres (périmètre géographique, centres
                d&apos;intérêt) dépendent de l&apos;offre et, le cas échéant,
                des réglages du membre, dans les conditions de l&apos;article
                3.7.1.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">3.6 Mot de passe</p>
              <p>
                L&apos;utilisateur peut à tout moment modifier son mot de
                passe depuis les paramètres de son profil (page Profil), sans
                avoir besoin de contacter l&apos;éditeur. Il lui appartient
                de choisir un mot de passe suffisamment robuste et de le
                garder confidentiel.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                3.7 Découvrir, suggestions et visibilité du compte
              </p>
              <p className="font-semibold text-gray-900">
                3.7.1 Filtrage des suggestions
              </p>
              <p>
                Les profils proposés sur Découvrir et dans les suggestions
                de l&apos;Accueil sont établis selon les critères permanents
                de mise en relation (article 3.5), quelle que soit l&apos;offre
                souscrite, et le fonctionnement décrit au glossaire (Like,
                Flash, Match).
              </p>
              <p>
                Les filtres avancés (périmètre géographique, centres
                d&apos;intérêt, tempérament, langues parlées) permettent
                d&apos;affiner les suggestions. Ils ne garantissent ni un
                nombre de résultats ni la compatibilité avec un autre
                membre. Les filtres enregistrés s&apos;appliquent
                également aux suggestions de la page d&apos;accueil.
              </p>
              <p>
                Un profil auquel l&apos;utilisateur a déjà adressé un Like
                ou un Flash n&apos;est plus présenté dans Découvrir ni dans
                les suggestions de l&apos;Accueil. Cette exclusion ne
                supprime pas l&apos;interaction déjà enregistrée : le
                profil demeure gérable depuis Mes Matchs, selon son statut
                (À étudier, Match, archive, etc.).
              </p>
              <p>
                Lorsqu&apos;un Like ou un Flash a été refusé — par
                l&apos;utilisateur, par l&apos;autre membre, ou du fait de
                l&apos;expiration automatique d&apos;une mise en attente —,
                le profil concerné n&apos;est plus proposé à l&apos;autre
                partie dans Découvrir ni dans les suggestions de
                l&apos;Accueil pendant un délai de 6 mois à compter de ce
                refus. Ce masquage s&apos;applique dans les deux sens. À
                l&apos;issue de ce délai, le profil peut à nouveau être
                présenté, sous réserve des autres filtres du présent article
                et des critères de mise en relation (article 3.5).
              </p>
              <p>
                Lorsque l&apos;utilisateur passe un profil proposé dans
                Découvrir (bouton « Passer »), sans lui adresser de Like ni
                de Flash, ce profil ne lui est plus proposé, ni dans
                Découvrir ni dans les suggestions de l&apos;Accueil, pendant
                un délai de 2 mois à compter de cette action. Ce masquage ne
                s&apos;applique que du côté de l&apos;utilisateur qui a passé
                le profil ; il est sans incidence pour l&apos;autre membre.
                À l&apos;issue de ce délai, le profil peut à nouveau être
                présenté, sous réserve des autres filtres du présent
                article.
              </p>
              <p>
                Lorsqu&apos;un Match est rompu (Annexe A, « Matchs
                rompus »), l&apos;autre membre n&apos;est plus proposé dans
                Découvrir ni dans les suggestions de l&apos;Accueil pendant
                un délai de 1 an à compter de la rupture si au moins un
                message avait été échangé entre les deux membres avant
                celle-ci, ou de 6 mois si aucun message n&apos;avait été
                échangé. Ce masquage s&apos;applique dans les deux sens. À
                l&apos;issue de ce délai, le profil peut à nouveau être
                présenté, sous réserve des autres filtres du présent
                article.
              </p>
              <p className="font-semibold text-gray-900">
                3.7.2 Modes de visibilité
              </p>
              <p>
                L&apos;utilisateur choisit un seul mode de visibilité à la
                fois, depuis le menu du compte (entrée « Visibilité »). Les
                libellés ci-dessous sont ceux affichés dans ce menu.
              </p>
              <p>
                <span className="font-semibold text-gray-900">Normale.</span>{' '}
                Le profil est visible normalement : il peut être proposé
                dans Découvrir et dans les suggestions de l&apos;Accueil,
                sous réserve des filtres de l&apos;article 3.7.1 et des
                autres conditions des présentes. Le statut de présence en
                ligne (article 3.8) peut être affiché aux autres membres.
              </p>
              <p>
                <span className="font-semibold text-gray-900">
                  Incognito.
                </span>{' '}
                L&apos;utilisateur continue d&apos;utiliser le Service. Son
                profil peut toujours être proposé dans Découvrir et dans
                les suggestions. En revanche, il n&apos;apparaît pas « en
                ligne » aux yeux des autres membres (article 3.8).
                L&apos;utilisateur Incognito continue, quant à lui, de voir
                le statut en ligne des autres membres, lorsque celui-ci
                leur est applicable.
              </p>
              <p>
                <span className="font-semibold text-gray-900">
                  Ne plus apparaître dans Découvrir et Suggestions.
                </span>{' '}
                Le profil n&apos;est plus proposé aux autres membres dans
                Découvrir ni dans les suggestions de l&apos;Accueil. Les
                Matchs déjà constitués, les conversations et les
                interactions déjà enregistrées (Likes, Flashs) sont
                conservés. L&apos;utilisateur peut continuer d&apos;utiliser
                le Service, y compris Mes Matchs et, dans les conditions de
                l&apos;article 2.3, la messagerie.
              </p>
              <p>
                <span className="font-semibold text-gray-900">
                  Mettre le compte en pause.
                </span>{' '}
                Le compte est mis en pause complète. L&apos;utilisateur
                peut encore se connecter ; l&apos;usage du Service est alors
                limité à la réactivation du compte. Le profil n&apos;est
                plus proposé dans Découvrir ni dans les suggestions de
                l&apos;Accueil pendant la durée de la pause. Aucun nouveau
                Like, Flash ou message n&apos;est enregistré à destination
                de ce compte pendant la pause ; un membre qui tente une
                telle interaction en est informé. Les Matchs, conversations et
                interactions déjà existants ne sont pas supprimés ; ils
                redeviennent utilisables à la réactivation. Les Likes,
                Flashs et messages qui auraient été adressés pendant la
                pause ne sont pas conservés.
              </p>
              <p>
                Un compte dont l&apos;utilisateur a choisi l&apos;un des
                modes ci-dessus, y compris « Mettre le compte en pause »,
                demeure un compte actif au sens des présentes CGU. Le
                statut de Membre Fondateur et le numéro associé ne sont
                pas perdus. Seule la suppression définitive du compte,
                dans les conditions de l&apos;article 8.2, emporte la
                perte définitive de ce badge et de ce numéro.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                3.8 Présence en ligne
              </p>
              <p>
                Lorsqu&apos;un membre utilise le Service dans une session
                active, un horodatage de dernière activité
                (last_active_at) peut être mis à jour périodiquement. Un
                profil est considéré comme « en ligne » lorsqu&apos;une
                activité récente est constatée (fenêtre de quelques
                minutes) et que le mode Incognito n&apos;est pas actif.
              </p>
              <p>
                Ce statut peut être signalé aux autres membres par un
                indicateur visuel (point vert) sur la photo de profil,
                notamment dans Découvrir, les suggestions de l&apos;Accueil
                et Mes Matchs. L&apos;horodatage lui-même n&apos;est pas
                affiché aux autres membres. En mode Incognito, le profil
                n&apos;est jamais présenté comme en ligne, même si le
                membre utilise effectivement le Service.
              </p>
              <p>
                Le traitement de last_active_at est décrit à l&apos;article
                8.1.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                3.9 Tempérament et langues parlées
              </p>
              <p>
                Le membre peut renseigner un tempérament et des langues
                parlées. Ces informations sont facultatives, sauf la
                langue maternelle dans les cas prévus au présent article.
                Elles sont visibles des autres membres sur le profil
                détaillé et peuvent être utilisées comme critères de
                recherche. Le membre s&apos;engage à les renseigner de
                façon sincère et exacte. Il peut les modifier ou les
                supprimer à tout moment depuis « Mon profil », sauf la
                langue maternelle lorsqu&apos;elle est obligatoire.
              </p>
              <p>
                La langue maternelle est obligatoire si le membre réside
                dans un pays ne figurant pas dans la liste des pays
                francophones définie par {BRAND_NAME}, ou s&apos;il
                souscrit une offre Premium ou International. Elle sert à
                proposer des mises en relation cohérentes.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-bold text-gray-900">
              Article 4 — Période d&apos;essai et statut « Membre Fondateur »
            </h3>
            <div>
              <p className="font-semibold text-gray-900">
                4.1 Membres Fondateurs (jusqu&apos;à {FOUNDER_MAX_SLOTS}{' '}
                comptes actifs)
              </p>
              <p>
                Un statut honorifique de « Membre Fondateur » est attribué dans
                la limite de {FOUNDER_MAX_SLOTS} comptes actifs simultanément
                (comptes non supprimés, indépendamment de la fréquence de
                connexion). L&apos;inactivité ne libère jamais une place. Une
                place n&apos;est libérée qu&apos;en cas de suppression du
                compte par son titulaire. Les numéros sont attribués parmi les
                numéros disponibles entre 1 et {FOUNDER_MAX_SLOTS} ; un numéro
                libéré par une suppression peut être attribué à un nouvel
                inscrit tant que le plafond n&apos;est pas atteint. Un même
                numéro peut donc, dans le temps, être détenu par plusieurs
                personnes successives. Le passage du Service en mode payant
                n&apos;est pas déclenché par une date calendaire fixe : le
                Service reste en phase de lancement tant que{' '}
                {FOUNDER_MAX_SLOTS} comptes Fondateur actifs ne sont pas
                simultanément atteints.
              </p>
              <p>
                Pendant une Période d&apos;essai de six (6) mois à compter de
                la création de son compte, le Membre Fondateur bénéficie, à
                titre gracieux, sans engagement de durée, sans tacite
                reconduction et sans aucune demande de carte bancaire : de
                l&apos;envoi de messages, de likes et Flash illimités, ainsi
                que d&apos;un boost de visibilité du profil pendant le premier
                mois suivant l&apos;inscription.
              </p>
              <p>
                Ce statut est honorifique : au-delà des avantages de la
                Période d&apos;essai décrits ci-dessus, il n&apos;ouvre droit
                à aucun remboursement, cession ou conversion en numéraire. Le
                titre et le numéro associé restent affichés tant que le
                compte est actif ; ils sont définitivement perdus en cas de
                désinscription ou de suppression du compte, dans les
                conditions de l&apos;article 8.2. Un compte dont la visibilité
                est restreinte ou qui est mis en pause au sens de
                l&apos;article 3.7 demeure un compte actif.
              </p>
              {founderOfferClosed ? (
                <p>{t('legal.founderOfferClosed')}</p>
              ) : null}
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                4.2 Autres utilisateurs
              </p>
              <p>
                Tout utilisateur créant un compte alors qu&apos;aucune place
                Fondateur n&apos;est disponible (plafond de {FOUNDER_MAX_SLOTS}{' '}
                comptes Fondateur actifs atteint) bénéficie d&apos;une Période
                d&apos;essai d&apos;une (1) semaine à compter de la création de
                son compte, pendant laquelle l&apos;envoi de messages est
                inclus gratuitement, sans carte bancaire ni engagement. Cette
                Période d&apos;essai n&apos;inclut pas les avantages
                complémentaires (likes et Flash illimités, boost de
                visibilité) réservés aux Membres Fondateurs à l&apos;article
                4.1.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                4.3 À l&apos;issue de la Période d&apos;essai
              </p>
              {SITE_FREE_MODE ? (
              <p>
                À l&apos;issue de sa Période d&apos;essai — six mois pour un
                Membre Fondateur, une semaine pour tout autre utilisateur —
                l&apos;utilisateur conserve l&apos;accès aux fonctionnalités
                du Service. Aucune souscription payante n&apos;est proposée
                ni exigée tant que le Service est en phase de lancement. À
                l&apos;issue de cette phase de lancement, une souscription
                payante pourra être proposée, mais elle ne sera jamais
                obligatoire : le compte basculera simplement vers l&apos;offre
                Gratuit.
              </p>
              ) : (
              <p>
                À l&apos;issue de sa Période d&apos;essai — six mois pour un
                Membre Fondateur, une semaine pour tout autre utilisateur — et à
                défaut de souscription à une offre payante, l&apos;utilisateur
                conserve un accès gratuit à la création et la gestion de son
                profil, à Découvrir, au Like, au Flash, à la constitution de
                Matchs et à la lecture des messages déjà reçus. Seul
                l&apos;envoi de nouveaux messages est alors soumis à la
                souscription d&apos;une offre payante active, dans les
                conditions de l&apos;article 2.4.
              </p>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-bold text-gray-900">
              Article 5 — Boost et statut Premium
            </h3>
            <p>
              Le badge « Premium » est le libellé d&apos;affichage des
              avantages Fondateur pendant leur période d&apos;activation de
              6 mois (article 4) : il matérialise visuellement, sur le
              profil, que ces avantages (likes et Flash illimités, Boost
              offert le premier mois) sont actuellement actifs. Il disparaît
              à l&apos;issue des 6 mois, à la différence du titre
              honorifique « Membre Fondateur » et de son numéro, qui restent
              affichés tant que le compte est actif (article 4). La validité
              du Boost est consultable à tout moment depuis la page « Mon
              profil ».
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-bold text-gray-900">
              Article 6 — Propriété intellectuelle et contenus utilisateurs
            </h3>
            <div>
              <p className="font-semibold text-gray-900">
                6.1 Éléments de la plateforme
              </p>
              <p>
                L&apos;ensemble de la structure du Site, de son code source,
                de ses interfaces, textes, graphismes, bases de données,
                logos et charte éditoriale est protégé par le droit
                d&apos;auteur, le droit des marques et, le cas échéant, le
                droit des producteurs de bases de données. Toute
                reproduction, extraction (y compris par scraping),
                adaptation ou exploitation non autorisée est interdite.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">6.2 Marque</p>
              <p>
                Le nom {BRAND_NAME}, ses déclinaisons et son identité
                visuelle sont protégés. Toute utilisation non autorisée est
                interdite.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                6.3 Contenus publiés par l&apos;utilisateur
              </p>
              <p>
                L&apos;utilisateur conserve les droits qu&apos;il détient sur
                les contenus qu&apos;il publie (photo, biographie, centres
                d&apos;intérêt, messages, le cas échéant témoignage).
              </p>
              <p>
                Il est déconseillé d&apos;y inscrire des informations
                sensibles, notamment relatives à la santé, à la religion,
                aux opinions, à l&apos;origine ou à l&apos;orientation.
              </p>
              <p>
                Il concède à l&apos;éditeur, pour la durée de présence des
                contenus sur le Service, une licence non exclusive, mondiale,
                gratuite et non cessible, strictement limitée à ce qui est
                nécessaire au fonctionnement du Site : hébergement,
                affichage aux membres concernés, mise en cache, sauvegarde
                technique et, le cas échéant, modération.
              </p>
              <p>
                Cette licence prend fin, sous réserve des copies de sauvegarde
                techniques transitoires, lors de la suppression du contenu ou
                du compte. L&apos;utilisateur garantit disposer des droits
                nécessaires et que ses contenus ne portent pas atteinte aux
                droits des tiers.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-bold text-gray-900">
              Article 7 — Responsabilités
            </h3>
            <p>
              {BRAND_NAME} est un outil de mise en relation. L&apos;éditeur
              n&apos;est pas partie aux relations nouées entre utilisateurs
              et n&apos;organise pas les rencontres hors ligne.
            </p>
            <p>
              L&apos;utilisateur est seul responsable des informations qu&apos;il
              communique, de l&apos;exactitude de son profil, de ses
              échanges et de ses rencontres. Il lui appartient de faire
              preuve de prudence (ne pas communiquer de données bancaires,
              privilégier un lieu public pour une première rencontre, etc.).
              L&apos;éditeur ne saurait être tenu des comportements hors
              ligne des membres, ni de l&apos;absence de rencontre, ni de
              l&apos;inexactitude d&apos;un profil d&apos;un tiers, dès lors
              qu&apos;il n&apos;en a pas eu une connaissance effective.
            </p>
            <p>
              L&apos;éditeur, agissant à titre bénévole, s&apos;oblige à une
              obligation de moyens : continuité raisonnable du Service,
              sécurité adaptée à un site de cette nature, modération diligente
              des signalements. Le Service est fourni « en l&apos;état » ;
              des interruptions (maintenance, force majeure, défaillance
              d&apos;un prestataire) peuvent survenir.
            </p>
            <p>
              La responsabilité de l&apos;éditeur ne peut être engagée qu&apos;en
              cas de faute prouvée qui lui est directement imputable. Elle
              est limitée, dans les limites permises par la loi, aux
              dommages directs. Rien dans les présentes n&apos;exclut la
              responsabilité en cas de faute lourde ou dolosive, ni
              l&apos;indemnisation des dommages corporels.
            </p>
            <p>
              Pour les contenus illicites signalés, l&apos;éditeur agit
              conformément à la LCEN dès qu&apos;il en a effectivement
              connaissance.
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-bold text-gray-900">
              Article 8 — Données personnelles, résiliation et droit applicable
            </h3>
            <div>
              <p className="font-semibold text-gray-900">
                8.1 Protection des données (RGPD)
              </p>
              <p>
                L&apos;éditeur est responsable du traitement des données
                personnelles collectées pour fournir le Service (compte,
                profil, interactions, messages, numéro de téléphone lorsque
                la vérification par SMS est utilisée, horodatage de dernière
                activité last_active_at visé à l&apos;article 3.8, journaux
                techniques nécessaires à la sécurité). Le traitement repose
                principalement sur l&apos;exécution du contrat
                d&apos;utilisation (les présentes CGU) et, le cas échéant,
                sur le consentement (par exemple notifications e-mail ou
                témoignage) ou l&apos;intérêt légitime (sécurité,
                prévention des fraudes et des comptes multiples).
              </p>
              <p>
                Le tempérament et les langues parlées, lorsqu&apos;ils
                sont renseignés, sont choisis dans des listes proposées
                par {BRAND_NAME} et traités afin d&apos;afficher le
                profil aux autres membres, de personnaliser les
                suggestions et de permettre la recherche par critères. Ils
                sont conservés tant que le compte existe et supprimés avec
                lui, selon les modalités prévues à l&apos;article 8.2.
              </p>
              <p>
                Les données ne sont pas vendues. Elles peuvent être
                transmises aux seuls prestataires strictement nécessaires
                (hébergeur, infrastructure technique, envoi d&apos;e-mails et
                de SMS de vérification),
                établis dans l&apos;Union européenne ou offrant des garanties
                appropriées.
              </p>
              <p>
                Cookies et traceurs. Le Service utilise, à ce jour,
                uniquement des cookies strictement nécessaires à son
                fonctionnement (notamment le maintien de la session de
                connexion), pour lesquels aucun consentement préalable
                n&apos;est requis. Si l&apos;éditeur venait à mettre en
                place, à l&apos;avenir, des cookies ou traceurs non
                essentiels (par exemple à des fins de mesure
                d&apos;audience), l&apos;utilisateur en serait informé au
                moyen d&apos;un bandeau dédié lui permettant d&apos;accepter,
                de refuser ou de personnaliser son consentement avant leur
                dépôt, conformément à la réglementation applicable. Une
                politique de cookies dédiée serait alors publiée et
                accessible depuis le Site.
              </p>
              <p>
                L&apos;utilisateur dispose des droits d&apos;accès,
                rectification, effacement, limitation, opposition et
                portabilité, ainsi que du droit d&apos;introduire une
                réclamation auprès de la CNIL (www.cnil.fr). Ces droits
                s&apos;exercent via les paramètres du profil et/ou à{' '}
                {SUPPORT_EMAIL}.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                8.2 Résiliation et suppression du compte
              </p>
              <p>
                L&apos;utilisateur peut à tout moment demander la suppression
                de son compte et de l&apos;intégralité de ses données
                personnelles depuis les paramètres de son profil.
              </p>
              <p>
                Les modes de visibilité de l&apos;article 3.7, y compris
                « Mettre le compte en pause », ne constituent pas une
                suppression du compte. Le profil et les données demeurent ;
                le compte reste actif. La perte du statut de Membre
                Fondateur et du numéro associé n&apos;intervient qu&apos;en
                cas de désinscription ou de suppression au titre du présent
                article 8.2.
              </p>
              <p>
                Pour l&apos;utilisateur, cette suppression est définitive :
                le profil n&apos;est plus visible et n&apos;est plus utilisé.
                Pour des raisons techniques et de sécurité (correction
                d&apos;une erreur de manipulation, obligations légales), les
                données peuvent être conservées de manière interne pendant
                un délai de purge de trente (30) jours, après lequel elles
                sont irrémédiablement effacées. Certaines traces
                strictement nécessaires (par exemple factures futures, ou
                conservation imposée par la loi) pourraient, le cas échéant,
                être conservées plus longtemps, de façon cloisonnée.
              </p>
              <p>
                Le statut de Membre Fondateur et son numéro associé sont
                strictement liés au compte actif. En cas de désinscription
                ou de suppression du compte, le badge est définitivement
                perdu pour ce compte. Le numéro ainsi libéré peut être
                attribué à un nouvel inscrit tant que le plafond de{' '}
                {FOUNDER_MAX_SLOTS} Membres Fondateurs actifs n&apos;est pas
                atteint.
              </p>
              <p>
                L&apos;éditeur peut résilier un compte en cas de manquement
                grave ou répété aux présentes CGU.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                8.3 Droit applicable et tribunaux compétents
              </p>
              <p>
                Les présentes CGU sont régies par le droit français.
              </p>
              <p>
                En cas de litige, et après tentative de résolution amiable
                (contact à {SUPPORT_EMAIL}), les tribunaux français
                compétents seront saisis. Lorsque l&apos;utilisateur a la
                qualité de consommateur, il peut saisir, outre les
                juridictions territorialement compétentes en vertu du code
                de procédure civile, la juridiction du lieu où il demeurait
                au moment de la conclusion du contrat ou de la survenance du
                fait dommageable. Il peut également recourir à un médiateur
                de la consommation, dans les conditions prévues par le code
                de la consommation, dès lors que cette voie lui est ouverte.
              </p>
            </div>
          </section>

          {/*
            Pause d’abonnement : non applicable tant que SITE_FREE_MODE
            (aucune offre payante). La clause est dans l’annexe ci-dessus,
            affichée seulement lorsque des CGV / modules payants existent.
          */}
          {!SITE_FREE_MODE && (
            <section className="space-y-3">
              <h3 className="text-base font-bold text-gray-900">
                Annexe — Offres payantes (renvoi aux CGV)
              </h3>
              <p>
                Lorsque des modules payants sont commercialisés, leurs prix,
                modalités de paiement, rétractation et résiliation figurent
                exclusivement dans des Conditions Générales de Vente
                distinctes, acceptées au moment de la souscription. Stripe et
                PayPal peuvent être utilisés comme prestataires de paiement.
              </p>
              <p>
                Si l&apos;utilisateur dispose alors d&apos;un abonnement
                payant, la mise en pause du compte (article 3.7) n&apos;emporte
                pas, par elle-même, la résiliation de cet abonnement. Les
                effets sur la facturation, la période déjà payée et une
                éventuelle suspension de prélèvement relèvent exclusivement
                des CGV acceptées lors de la souscription.
              </p>
              <p>
                Les membres disposant d&apos;un abonnement Premium actif
                peuvent soumettre un témoignage. La publication du texte et
                du prénom n&apos;a lieu qu&apos;après un consentement
                explicite, via une case à cocher non pré-cochée. Le
                témoignage est supprimé en cas de retrait du consentement ou
                de suppression du compte (RGPD).
              </p>
            </section>
          )}

          <section className="space-y-3">
            <h3 className="text-base font-bold text-gray-900">
              Annexe A — Glossaire
            </h3>
            <div>
              <p className="font-semibold text-gray-900">Mes Matchs</p>
              <p>
                Page regroupant les interactions de l&apos;utilisateur
                (intérêts reçus, Matchs, archives et espaces associés). Sur
                cette page, les profils sont classés par ordre chronologique
                d&apos;apparition : les plus récemment ajoutés apparaissent
                en haut à gauche de la grille, tandis que les profils apparus
                antérieurement sont progressivement repoussés vers le bas à
                droite, selon l&apos;ordre de lecture habituel (de gauche à
                droite, puis de haut en bas).
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Like</p>
              <p>
                Action simple permettant d&apos;exprimer un intérêt pour le
                profil d&apos;un autre membre de manière discrète.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Flash</p>
              <p>
                Action prioritaire et plus appuyée qu&apos;un simple Like,
                envoyant un signal fort et direct à la personne ciblée pour
                lui signifier un intérêt immédiat.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Match</p>
              <p>
                Relation bilatérale établie entre deux membres, actant
                qu&apos;un intérêt mutuel a été confirmé (qu&apos;il
                provienne de Likes croisés ou d&apos;un Flash accepté).
                Un Match ouvre toujours le Dialogue entre les deux profils,
                indépendamment de leurs offres.
                {!SITE_FREE_MODE && (
                  <>
                    {' '}
                    L&apos;envoi de messages
                    reste soumis à la capacité d&apos;envoi de
                    l&apos;expéditeur à l&apos;issue de sa Période
                    d&apos;essai (article 4), selon l&apos;article 2.3.
                  </>
                )}
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                Messagerie et consentement
              </p>
              <p>
                Par mesure de sécurité et de prévention des contacts non
                sollicités, l&apos;ouverture d&apos;un Dialogue sans Match
                n&apos;est possible que lorsque le profil du destinataire
                est ouvert (Gratuit, Basique, Essentiel). Un destinataire
                Confort, Premium ou Membre Fondateur pendant sa Période
                d&apos;essai n&apos;est joignable qu&apos;après un Match
                (Like ou Flash réciproque), sauf s&apos;il a activé le mode
                Simplifié : il devient alors joignable sans Match, comme un
                profil Essentiel. Ce choix ne joue qu&apos;en réception : il
                ne permet jamais d&apos;écrire à un autre profil resté
                protégé sans Match. Un Match, lorsqu&apos;il
                existe, ouvre toujours le Dialogue.
                {!SITE_FREE_MODE && (
                  <>
                    {' '}
                    En complément,
                    l&apos;expéditeur doit disposer de la capacité d&apos;envoi
                    (semaine d&apos;essai Gratuit, ou palier payant actif)
                    à l&apos;issue de sa Période d&apos;essai (article 4),
                    selon les articles 2.3 et 2.4.
                  </>
                )}
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">À étudier</p>
              <p>
                Statut d&apos;un profil dont le Like ou le Flash a été reçu
                et n&apos;a pas encore fait l&apos;objet d&apos;une décision.
                L&apos;utilisateur peut alors refuser le profil, le mettre
                en attente, ou confirmer un Match.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Mettre en attente</p>
              <p>
                Action permettant de conserver un profil reçu (Like ou Flash)
                afin de l&apos;étudier plus tard, sans le refuser ni le
                matcher immédiatement. Le profil reste alors accessible
                depuis Mes Matchs, dans « Mis en attente par toi », jusqu&apos;à
                ce que l&apos;attente soit close : par Matcher, par un refus,
                ou par l&apos;expiration automatique au terme de 3 mois
                d&apos;inaction. Archiver n&apos;est pas une clôture : il
                s&apos;agit d&apos;un rangement personnel, sans effet sur
                l&apos;interaction ni sur l&apos;autre membre. Le statut
                demeure en attente, le délai d&apos;expiration continue de
                courir, et aucune notification n&apos;est adressée à
                l&apos;autre membre. Les profils ainsi rangés restent
                visibles dans « Mis en attente par toi - archive ».
                Réciproquement, lorsqu&apos;un autre membre met en attente le
                Like ou le Flash de l&apos;utilisateur, ce profil apparaît
                pour l&apos;utilisateur dans « Mis en attente par l&apos;autre
                », en consultation uniquement : la décision d&apos;attendre,
                de matcher ou de refuser appartient à l&apos;autre membre.
              </p>
              <p>
                Un profil placé en statut « mis en attente » (que ce soit par
                vous ou par l&apos;autre membre) sans décision explicite
                (acceptation ou refus) est automatiquement considéré comme
                refusé au terme d&apos;un délai de 3 mois d&apos;inaction.
                Archiver un profil en attente ne constitue pas une telle
                décision et n&apos;interrompt pas ce délai. Un rappel est
                adressé 7 jours avant l&apos;expiration afin de permettre de
                statuer sur les demandes en attente. Cette clôture automatique
                produit les mêmes effets qu&apos;un refus manuel, dans les
                deux sens, afin qu&apos;aucune interaction ne demeure
                indéfiniment en suspens. Le refus ainsi constitué, qu&apos;il
                soit manuel ou automatique, emporte également le masquage
                temporaire dans Découvrir et les suggestions de
                l&apos;Accueil décrit à l&apos;article 3.7.1.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Matché le</p>
              <p>
                Libellé affiché lorsque c&apos;est l&apos;utilisateur
                connecté qui valide ou accepte la sollicitation entrante
                d&apos;un tiers (Like reçu, Flash reçu, ou intérêt en
                attente tranché par Matcher). La date indiquée est celle de
                cette acceptation (« Matché le [date] »). Sur Mes Matchs, ce
                libellé peut être complété par « — 1er mot » ou « —
                Discussion en cours » selon l&apos;état de la messagerie.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Match le</p>
              <p>
                Libellé affiché lorsque le Match découle de l&apos;acceptation
                par l&apos;autre membre de la sollicitation initiale de
                l&apos;utilisateur connecté (Like ou Flash envoyé, puis
                accepté en retour). La date indiquée est celle de cette
                acceptation (« Match le [date] »). Sur Mes Matchs, ce
                libellé peut également être complété par « — 1er mot » ou
                « — Discussion en cours » selon l&apos;état de la messagerie.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">1er mot</p>
              <p>
                Une conversation reste au statut « 1er mot » tant qu&apos;un
                seul des deux membres a engagé l&apos;échange sans réponse de
                l&apos;autre partie, ou tant qu&apos;aucun message n&apos;a
                encore été envoyé. La messagerie est ouverte ; l&apos;échange
                n&apos;est pas encore réciproque.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                Discussion en cours
              </p>
              <p>
                Une conversation passe au statut « Discussion en cours »
                uniquement lorsque chacun des deux membres a envoyé au moins
                un message, marquant ainsi un échange réciproque.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                Archiver / Supprimer
              </p>
              <p>
                Options de gestion proposées pour les profils ayant décliné
                un Like ou un Flash, ainsi que pour les profils mis en
                attente. Archiver conserve le profil dans un espace dédié de
                la page Mes Matchs. Pour une attente, archiver n&apos;est
                qu&apos;un rangement personnel : cela ne clôt pas
                l&apos;interaction, n&apos;interrompt pas le délai
                d&apos;expiration et n&apos;est pas notifié à l&apos;autre
                membre (voir « Mettre en attente »). Supprimer retire le
                profil de cette liste ; pour une attente, la suppression
                définitive équivaut à un refus.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Matchs rompus</p>
              <p>
                Espace de conservation des Matchs archivés ou rompus depuis
                une conversation déjà validée, distingué selon l&apos;auteur
                de la décision. Si l&apos;utilisateur est lui-même à
                l&apos;origine de l&apos;archivage ou de la rupture, le Match
                apparaît dans « Matchs rompus par toi » : il peut alors
                rétablir le lien (et l&apos;accès à la messagerie) ou le
                supprimer définitivement. Si c&apos;est l&apos;autre
                personne qui a rompu le lien, le Match apparaît dans « Matchs
                rompus par l&apos;autre » : seule la suppression définitive
                est possible, le rétablissement n&apos;étant pas proposé.
                L&apos;autre membre n&apos;est en outre plus proposé dans
                Découvrir ni dans les suggestions de l&apos;Accueil pendant
                un délai de 1 an (si un message avait été échangé avant la
                rupture) ou de 6 mois (à défaut), dans les conditions de
                l&apos;article 3.7.1.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Boost</p>
              <p>
                Fonctionnalité permettant de mettre en avant son profil en
                tête de liste pendant une durée déterminée pour maximiser sa
                visibilité.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Découvrir</p>
              <p>
                Page permettant de parcourir des profils compatibles, selon
                les critères de mise en relation et le filtrage décrits à
                l&apos;article 3.7.1.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Passer</p>
              <p>
                Action disponible sur Découvrir permettant d&apos;écarter un
                profil sans lui adresser de Like ni de Flash. Le profil
                concerné n&apos;est alors plus proposé, uniquement à
                l&apos;utilisateur qui l&apos;a passé, pendant un délai de
                2 mois (article 3.7.1).
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Suggestions</p>
              <p>
                Profils proposés sur l&apos;Accueil. Ils obéissent au même
                filtrage que Découvrir (article 3.7.1) et aux modes de
                visibilité de l&apos;article 3.7.2.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">Visibilité</p>
              <p>
                Paramètre du compte à choix unique, accessible depuis le
                menu du compte. Les quatre modes sont : Normale, Incognito,
                Ne plus apparaître dans Découvrir et Suggestions, et
                Mettre le compte en pause (article 3.7.2).
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">En ligne</p>
              <p>
                Indicateur (point vert sur la photo) signalant qu&apos;un
                membre a une activité récente et n&apos;est pas en mode
                Incognito. Voir l&apos;article 3.8.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-bold text-gray-900">
              Annexe B — Questions fréquentes
            </h3>
            <div>
              <p className="font-semibold text-gray-900">
                Puis-je m&apos;inscrire si j&apos;ai moins de 18 ans&nbsp;?
              </p>
              <p>
                Non. Le Service est exclusivement réservé aux personnes
                majeures.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                Selon quels critères les profils me sont-ils proposés dans
                Découvrir&nbsp;?
              </p>
              <p>
                Pour tous les membres, quelle que soit l&apos;offre : le
                genre recherché (un homme se voit proposer des profils de
                femmes, et réciproquement), un écart d&apos;âge raisonnable entre les
                deux profils, et le fait qu&apos;Aypik s&apos;adresse
                exclusivement aux personnes sans enfants. Ces critères ne
                sont pas optionnels. Le périmètre géographique et les
                centres d&apos;intérêt peuvent, selon l&apos;offre, être
                personnalisés (article 3.7.1).
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                Puis-je créer plusieurs comptes&nbsp;?
              </p>
              <p>
                Non. Un seul compte par personne et par adresse e-mail, selon
                l&apos;article 3.3.
              </p>
            </div>
            {!SITE_FREE_MODE && (
            <div>
              <p className="font-semibold text-gray-900">
                Quelles sont les offres payantes&nbsp;?
              </p>
              <p>
                Quatre paliers : Basique (9,99&nbsp;€/mois), Essentiel
                (14,99&nbsp;€/mois), Confort (19,99&nbsp;€/mois) et Premium
                (24,99&nbsp;€/mois), plus des options à la carte
                (Visibilité, portée Francophone ou International — choix
                exclusif — et Boost 24&nbsp;h). Le détail à jour figure sur
                la page des offres. Les CGV ci-dessous décrivent les
                modalités de souscription, de résiliation et de
                rétractation.
              </p>
            </div>
            )}
            <div>
              <p className="font-semibold text-gray-900">
                Le Service va-t-il devenir payant&nbsp;?
              </p>
              {SITE_FREE_MODE ? (
              <p>
                Non pour le moment. Le Service est en phase de lancement :
                aucune offre payante n&apos;est commercialisée, aucun
                paiement n&apos;est demandé. La création de profil, la
                découverte de membres, le Like, le Flash, la constitution de
                Matchs et l&apos;envoi de messages sont inclus dans les
                conditions de la Période d&apos;essai (article 4). Même à
                l&apos;issue de cette phase de lancement, une souscription
                payante pourra éventuellement être proposée, mais elle ne
                sera jamais obligatoire : à défaut de souscription, le
                compte reste utilisable via l&apos;offre Gratuit (article
                4.3).
              </p>
              ) : (
              <p>
                La création de profil, la découverte de membres, le Like, le
                Flash et la constitution de Matchs restent gratuits.
                L&apos;envoi de messages est offert pendant la Période
                d&apos;essai définie à l&apos;article 4 (six mois pour les
                Membres Fondateurs, une semaine pour les autres utilisateurs) ;
                au-delà, il nécessite un abonnement actif, dont les
                conditions et tarifs sont précisés par des CGV distinctes,
                communiquées avant toute souscription et tout paiement.
              </p>
              )}
            </div>
            {!SITE_FREE_MODE && (
            <div>
              <p className="font-semibold text-gray-900">
                Puis-je toujours consulter et lire les messages déjà reçus
                sans abonnement&nbsp;?
              </p>
              <p>
                Oui. À l&apos;issue de sa Période d&apos;essai (article 4),
                seul l&apos;envoi de nouveaux messages est réservé aux
                abonnés ; la consultation des Matchs et des messages déjà
                reçus reste accessible sans paiement (article 2.3).
              </p>
            </div>
            )}
            <div>
              <p className="font-semibold text-gray-900">
                Comment se passe la suppression de mon compte&nbsp;?
              </p>
              <p>
                Elle est demandée depuis le profil. Le profil n&apos;est plus
                visible. Les données sont irrémédiablement effacées après un
                délai de purge de 30 jours (article 8.2).
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                Que devient le badge Membre Fondateur si je me
                désinscris&nbsp;?
              </p>
              <p>
                Le statut de Membre Fondateur et son numéro associé sont
                strictement liés au compte actif. En cas de désinscription
                ou de suppression du compte, le badge est définitivement
                perdu pour ce compte. Le numéro ainsi libéré peut être
                attribué à un nouvel inscrit tant que le plafond de{' '}
                {FOUNDER_MAX_SLOTS} Membres Fondateurs actifs n&apos;est pas
                atteint.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                Un profil que j&apos;ai déjà liké ou flashé peut-il
                réapparaître dans Découvrir&nbsp;?
              </p>
              <p>
                Non. Il n&apos;est plus proposé dans Découvrir ni dans les
                suggestions de l&apos;Accueil (article 3.7.1). L&apos;interaction
                reste gérable depuis Mes Matchs.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                Un profil dont le Like ou le Flash a été refusé peut-il
                réapparaître dans Découvrir&nbsp;?
              </p>
              <p>
                Oui, mais seulement après un délai de 6 mois à compter du
                refus (article 3.7.1), et sous réserve des autres filtres de
                suggestions. Ce délai s&apos;applique que le refus ait été
                exprimé par l&apos;utilisateur, par l&apos;autre membre, ou
                qu&apos;il résulte de l&apos;expiration automatique d&apos;une
                mise en attente.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                Un profil que j&apos;ai passé (bouton « Passer ») peut-il
                réapparaître dans Découvrir&nbsp;?
              </p>
              <p>
                Oui, après un délai de 2 mois à compter de cette action
                (article 3.7.1), sous réserve des autres filtres de
                suggestions. Ce masquage ne s&apos;applique que de votre
                côté : il est sans incidence pour l&apos;autre membre.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                Un Match rompu peut-il réapparaître dans Découvrir&nbsp;?
              </p>
              <p>
                Oui, après un délai de 1 an si un message avait été échangé
                avant la rupture, ou de 6 mois dans le cas contraire
                (article 3.7.1), sous réserve des autres filtres de
                suggestions. Ce masquage s&apos;applique dans les deux sens.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                Quelle est la différence entre mettre le compte en pause et
                supprimer mon compte&nbsp;?
              </p>
              <p>
                « Mettre le compte en pause » (article 3.7) laisse le compte
                actif : le badge Membre Fondateur et son numéro sont
                conservés ; le profil n&apos;est plus proposé dans Découvrir
                ni dans les suggestions, et les nouvelles interactions ne
                sont pas enregistrées le temps de la pause. La suppression
                (article 8.2) est définitive : le profil n&apos;est plus
                utilisé, les données sont effacées après le délai de purge,
                et le badge Fondateur est perdu.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                Que signifie le point vert sur une photo de profil&nbsp;?
              </p>
              <p>
                Il indique que le membre est considéré comme en ligne
                (article 3.8). Ce point n&apos;apparaît pas si ce membre a
                activé Incognito.
              </p>
            </div>
          </section>

          {!SITE_FREE_MODE && (
          <section className="space-y-3">
            <h3 className="text-base font-bold text-gray-900">
              Conditions Générales de Vente (CGV)
            </h3>
            <p className="text-xs text-gray-500">
              Squelette publié pour information. À faire relire par un
              professionnel du droit avant toute commercialisation.
            </p>
            <div>
              <p className="font-semibold text-gray-900">1. Objet</p>
              <p>
                Les présentes CGV régissent les offres payantes du Service
                Aypik : Basique, Essentiel, Confort, Premium, options à la
                carte (Visibilité, Pays francophone, International) et Boost
                24 h. Le détail à jour des droits et tarifs figure sur la
                page des offres du Service.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                2. Souscription, paiement, durée
              </p>
              <p>
                Les abonnements sont sans engagement de durée, renouvelés
                mensuellement, et résiliables en un clic depuis le profil.
                L&apos;accès payant reste actif jusqu&apos;à la fin de la
                période déjà réglée. Le paiement est assuré par des
                prestataires (carte via Stripe, PayPal). Aypik ne stocke pas
                les données de carte.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                3. Rétractation et Boost
              </p>
              <p>
                Les règles de rétractation applicables aux services
                numériques fournis immédiatement s&apos;articulent avec la
                Période d&apos;essai visée à l&apos;article 4 des CGU. Le
                Boost 24 h est un achat unique, non remboursable une fois
                activé.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                4. Membre Fondateur
              </p>
              <p>
                Le statut de Membre Fondateur est une offre promotionnelle
                distincte (6 mois offerts, jusqu&apos;à {FOUNDER_MAX_SLOTS}{' '}
                comptes actifs). À l&apos;issue de cette période, le compte
                bascule vers l&apos;offre Gratuite, sauf souscription d&apos;un
                palier payant. Le badge et le numéro restent affichés tant que
                le compte n&apos;est pas supprimé.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                5. Modification des tarifs
              </p>
              <p>
                Les tarifs et le contenu des offres peuvent évoluer. La
                version à jour est celle affichée sur la page des offres.
                Une modification en cours d&apos;abonnement est notifiée
                avant son application.
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                6. Portée Francophone / International
              </p>
              <p>
                Francophone et International forment un choix exclusif à
                deux paliers, non cumulables. International englobe déjà
                Francophone. Le tarif International est de 5,99&nbsp;€
                depuis Essentiel (aucune extension incluse) et de
                2,99&nbsp;€ depuis Confort (mise à niveau : Francophone est
                déjà inclus dans l&apos;abonnement). Il est inclus dans
                Premium.
              </p>
            </div>
          </section>
          )}

          <footer className="border-t border-gray-100 pt-6 text-xs text-gray-400 space-y-2">
            <p>
              Vous avez des questions ?{' '}
              <ContactLink className="underline underline-offset-2 hover:text-rose-600 transition-colors" />
            </p>
            <p>
              En utilisant {BRAND_NAME} — {BRAND_BASELINE} — vous confirmez
              avoir lu et accepté les présentes Conditions Générales
              d&apos;Utilisation.
            </p>
          </footer>
        </article>
        )}
        {locale !== 'fr' && <LegalTranslationBanner variant="end" />}

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-semibold text-rose-600 hover:text-rose-700"
          >
            {t('legal.back')}
          </button>
        </div>
      </main>
    </div>
  );
}
