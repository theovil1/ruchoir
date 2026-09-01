/**
 * Demonstration data for the UI exploration (L5a). Ported from the design-system kit's
 * `kit-data.jsx`; names and contents are fictional. This module is reached ONLY through
 * the data seam (lib/data) so that the future HTTP implementation can replace it without
 * views ever importing fixtures directly. Do not import this file from a screen.
 */
import type {
  Channel,
  DirectMessage,
  Message,
  Profile,
  SpaceFile,
  Workspace,
} from "@/lib/data/types";

export const WORKSPACES: Workspace[] = [
  { id: "atelier", name: "Atelier Nantes", members: 14 },
  { id: "morel", name: "Cabinet Morel", members: 6 },
];

export const CHANNELS: Channel[] = [
  { id: "general", name: "général", fav: true, unread: 0, type: "public", topic: "Annonces et vie de l'atelier" },
  { id: "compta", name: "comptabilité-2026", fav: true, unread: 3, type: "private", topic: "Suivi des écritures et rapprochements", imported: "Slack" },
  { id: "atelier-bois", name: "atelier-bois", fav: false, unread: 0, type: "public", topic: "Coordination de l'atelier bois" },
  { id: "chantier-reze", name: "chantier-rezé", fav: false, unread: 12, type: "public", topic: "Chantier de Rezé, suivi et logistique", imported: "Mattermost" },
  { id: "veille", name: "veille-marché", fav: false, unread: 0, type: "public", topic: "Appels d'offres et veille concurrentielle" },
  { id: "archives-2025", name: "archives-2025", fav: false, unread: 0, type: "archived", topic: "Canal archivé, lecture seule" },
];

export const DMS: DirectMessage[] = [
  { id: "camille", name: "Camille Roussel", presence: "online", unread: 1 },
  { id: "yanis", name: "Yanis Berthier", presence: "away", unread: 0 },
  { id: "adele", name: "Adèle Fournier", presence: "busy", unread: 0 },
  { id: "bot", name: "Assistant d'import", presence: "online", unread: 0, bot: true },
];

export const MESSAGES: Record<string, Message[]> = {
  compta: [
    {
      id: 1,
      author: "Camille Roussel",
      time: "09:41",
      body: "Le bilan est prêt. Je le dépose dans les fichiers du canal, relecture avant vendredi si possible.",
      attachment: { name: "Bilan_2026_v4.ods", size: "248 Ko", kind: "file-spreadsheet" },
      reactions: [
        { emoji: "✅", count: 2 },
        { emoji: "👍", count: 1, mine: true },
      ],
      saved: true,
    },
    {
      id: 2,
      author: "Yanis Berthier",
      time: "09:43",
      body: "Reçu. Deux écritures de mars à rapprocher, je te fais un retour dans la journée.",
      replies: 2,
    },
    {
      id: 3,
      author: "Adèle Fournier",
      time: "10:02",
      body: "Rappel : la reprise des historiques Slack s'arrête au 12 janvier. Les messages antérieurs restent consultables dans l'archive exportée.",
      imported: true,
    },
    {
      id: 4,
      author: "Camille Roussel",
      time: "10:15",
      body: "Parfait. J'épingle le fichier pour qu'il reste accessible depuis l'en-tête du canal.",
      pinned: true,
    },
    {
      id: 5,
      kind: "system",
      systemIcon: "user-plus",
      author: "",
      time: "10:18",
      body: "Adèle Fournier a rejoint le canal.",
    },
    {
      id: 6,
      author: "Yanis Berthier",
      time: "10:20",
      body: "J'ai retrouvé la doc officielle sur la clôture, ça répond à ta question sur les écritures de mars :",
      link: {
        url: "https://entreprendre.service-public.fr/vosdroits/F31201",
        domain: "entreprendre.service-public.fr",
        title: "La clôture comptable : étapes et obligations",
        description:
          "Opérations de clôture des comptes annuels pour les TPE et PME : inventaire, écritures d'ajustement, établissement des comptes.",
        hasImage: true,
      },
      saved: true,
    },
    {
      id: 7,
      author: "Camille Roussel",
      time: "10:24",
      body: "Et voici le graphe des écritures de mars, pour visualiser les rapprochements restants :",
      image: { alt: "Graphique des écritures de mars", width: 520, height: 300 },
    },
    {
      id: 8,
      author: "Camille Roussel",
      time: "10:26",
      body: "Je décale finalement la relecture à jeudi, ça nous laisse le temps de tout rapprocher.",
      edited: true,
      readBy: ["Yanis Berthier", "Adèle Fournier"],
    },
    {
      id: 9,
      author: "Yanis Berthier",
      time: "10:27",
      body: "",
      deleted: true,
    },
  ],
  general: [
    {
      id: 101,
      author: "Adèle Fournier",
      time: "08:55",
      body: "Bonjour à toutes et tous. Réunion d'atelier à 14 h en salle bois, ordre du jour partagé dans les fichiers.",
    },
    {
      id: 102,
      author: "Sofia Nadir",
      time: "09:10",
      body: "@Camille Roussel peux-tu confirmer le budget fournitures pour le chantier de Rezé ? On aimerait commander cette semaine.",
      replies: 1,
    },
    {
      id: 103,
      author: "Marc Lévêque",
      time: "09:32",
      body: "Les nouvelles lames sont arrivées, je les range à l'atelier.",
      reactions: [{ emoji: "👍", count: 3 }],
    },
  ],
  "chantier-reze": [
    {
      id: 201,
      author: "Adèle Fournier",
      time: "Hier, 16:40",
      body: "Livraison décalée à jeudi matin. @Camille Roussel il faudra prévenir le client pour l'accès au parking.",
      imported: true,
      replies: 2,
    },
    {
      id: 202,
      author: "Yanis Berthier",
      time: "Hier, 17:05",
      body: "Le devis de menuiserie est validé côté compta, je l'ai déposé dans les fichiers de l'espace.",
      attachment: { name: "Devis_menuiserie.pdf", size: "820 Ko", kind: "file" },
    },
  ],
  yanis: [
    {
      id: 301,
      author: "Yanis Berthier",
      time: "09:20",
      body: "Je te confirme les deux écritures de mars avant midi.",
    },
    {
      id: 302,
      author: "Camille Roussel",
      time: "09:22",
      body: "Parfait, merci. On boucle la relecture jeudi.",
      readBy: ["Yanis Berthier"],
    },
  ],
  bot: [
    {
      id: 401,
      author: "Assistant d'import",
      time: "Hier, 18:02",
      body: "Import Slack terminé : 6 canaux, 8 912 messages et 143 fichiers repris. Les messages portent le label « Importé de Slack » pendant 7 jours.",
    },
    {
      id: 402,
      author: "Assistant d'import",
      time: "Hier, 18:03",
      body: "Import Nextcloud en cours : 42 % des fichiers transférés. Je te préviens ici dès que c'est terminé.",
    },
  ],
};

export const FILES: SpaceFile[] = [
  { name: "Bilan_2026_v4.ods", kind: "file-spreadsheet", size: "248 Ko", by: "Camille Roussel", when: "Aujourd'hui, 09:41", source: "Ruchoir", version: "v4" },
  { name: "Rapprochement_mars.csv", kind: "file-text", size: "18 Ko", by: "Yanis Berthier", when: "Hier, 17:20", source: "Ruchoir", version: "v1" },
  { name: "Plan_atelier_rezé.pdf", kind: "file", size: "3,4 Mo", by: "Adèle Fournier", when: "24 août", source: "Nextcloud", version: "v2" },
  { name: "Devis_menuiserie.pdf", kind: "file", size: "820 Ko", by: "Camille Roussel", when: "21 août", source: "Slack", version: "v1" },
  { name: "Photos_chantier", kind: "folder", size: "36 éléments", by: "Yanis Berthier", when: "18 août", source: "Nextcloud", version: "" },
];

/** The signed-in user this exploration renders as. */
export const CURRENT_USER = { name: "Camille Roussel" };

export const PROFILES: Record<string, Profile> = {
  "Camille Roussel": {
    name: "Camille Roussel",
    role: "Gérante",
    presence: "online",
    email: "camille.roussel@atelier-nantes.fr",
    timezone: "Europe/Paris",
    localTime: "10:32",
    pronouns: "elle",
    bio: "Suivi comptable et administratif de l'atelier.",
  },
  "Yanis Berthier": {
    name: "Yanis Berthier",
    role: "Comptable",
    presence: "away",
    email: "yanis.berthier@atelier-nantes.fr",
    timezone: "Europe/Paris",
    localTime: "10:32",
    pronouns: "il",
    bio: "Rapprochements bancaires et clôtures mensuelles.",
  },
  "Adèle Fournier": {
    name: "Adèle Fournier",
    role: "Cheffe d'atelier",
    presence: "busy",
    email: "adele.fournier@atelier-nantes.fr",
    timezone: "Europe/Paris",
    localTime: "10:32",
    pronouns: "elle",
    bio: "Coordination des chantiers et des équipes bois.",
  },
  "Marc Lévêque": {
    name: "Marc Lévêque",
    role: "Menuisier",
    presence: "offline",
    email: "marc.leveque@atelier-nantes.fr",
    timezone: "Europe/Paris",
    localTime: "10:32",
    pronouns: "il",
  },
  "Sofia Nadir": {
    name: "Sofia Nadir",
    role: "Apprentie",
    presence: "online",
    email: "sofia.nadir@atelier-nantes.fr",
    timezone: "Europe/Paris",
    localTime: "10:32",
    pronouns: "elle",
  },
  "Assistant d'import": {
    name: "Assistant d'import",
    role: "Robot d'espace",
    presence: "online",
    email: "import@ruchoir.local",
    timezone: "Europe/Paris",
    localTime: "10:32",
    bio: "Suit et rapporte l'avancement des imports Nextcloud, Slack et Mattermost.",
    bot: true,
  },
};
