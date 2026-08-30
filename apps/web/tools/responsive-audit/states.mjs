/**
 * The set of UI states the audit visits. Each state is reached through the dev deep-link
 * (see lib/dev/deeplink.ts): the runner appends `query` to the base URL, so no click-scripting
 * is needed to open a modal or switch view. `waitFor` is an optional selector the runner waits
 * for before probing, to be sure the state has actually rendered.
 *
 * Channel and DM ids come from the mock fixtures (lib/mock/fixtures.ts). Keep them in sync if
 * the seed changes.
 */

/** @typedef {{ id: string, label: string, query: string, waitFor?: string }} AuditState */

/** @type {AuditState[]} */
export const STATES = [
  // Auth flow (full-screen, centered layouts).
  { id: "login", label: "Connexion", query: "stage=login" },
  { id: "signup", label: "Creation de compte", query: "stage=signup" },
  { id: "onboarding", label: "Onboarding", query: "stage=onboarding" },

  // Main app shell across its views.
  { id: "channel", label: "Canal (public)", query: "stage=app&view=channel&channel=general" },
  { id: "channel-private", label: "Canal (prive, importe)", query: "stage=app&view=channel&channel=compta" },
  { id: "dm", label: "Message direct", query: "stage=app&view=channel&channel=yanis" },
  { id: "channel-members", label: "Canal + panneau membres", query: "stage=app&view=channel&channel=general&panel=members" },
  { id: "channel-files", label: "Canal + panneau fichiers", query: "stage=app&view=channel&channel=general&panel=files" },
  { id: "files", label: "Fichiers de l'espace", query: "stage=app&view=files" },

  // Compact-only: the pushed content full-screen (in the desktop shell these render the same as
  // their non-pushed twin, but on narrow viewports they exercise the conversation/content views
  // that the bottom-tab list would otherwise hide). `push=1` sets mobileContent on mount.
  { id: "channel-open", label: "Canal ouvert (compact)", query: "stage=app&view=channel&channel=general&push=1" },
  { id: "dm-open", label: "Message direct ouvert (compact)", query: "stage=app&view=channel&channel=yanis&push=1" },
  { id: "files-open", label: "Fichiers ouvert (compact)", query: "stage=app&view=files&push=1" },
  { id: "settings-open", label: "Reglages ouvert (compact)", query: "stage=app&view=settings&push=1" },
  { id: "settings", label: "Reglages de l'espace", query: "stage=app&view=settings" },
  { id: "threads", label: "Fils", query: "stage=app&view=threads" },
  { id: "mentions", label: "Mentions", query: "stage=app&view=mentions" },
  { id: "saved", label: "Enregistres", query: "stage=app&view=saved" },

  // Modals / overlays (deep-linked open).
  { id: "modal-import", label: "Assistant d'import", query: "stage=app&modal=import" },
  { id: "modal-search", label: "Recherche globale", query: "stage=app&modal=search" },
  { id: "modal-newChannel", label: "Nouveau canal", query: "stage=app&modal=newChannel" },
  { id: "modal-newMessage", label: "Nouveau message", query: "stage=app&modal=newMessage" },
  { id: "modal-invite", label: "Inviter des personnes", query: "stage=app&modal=invite" },
  { id: "modal-newWorkspace", label: "Nouvel espace", query: "stage=app&modal=newWorkspace" },
  { id: "modal-help", label: "Aide", query: "stage=app&modal=help" },
  { id: "modal-prefs", label: "Preferences", query: "stage=app&modal=prefs" },
];

/** Filter helper used by the runner: keep states whose id is in the requested list. */
export function filterStates(states, ids) {
  if (!ids || ids.length === 0) return states;
  const wanted = new Set(ids);
  return states.filter((s) => wanted.has(s.id));
}
