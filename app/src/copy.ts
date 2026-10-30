/** Copy deck: PRD §9.6, exact strings. Every screen reads its text from here, never inline. */
export const copy = {
  'banner.practice': 'Practice chat only. Nothing here is posted to Twitch.',
  'overlay.alarm': 'FIRE DRILL IN PROGRESS · practice chat only',
  'mod.waiting': "You're in. Remove attacks, leave regulars alone.",
  'mod.falseBan': 'False ban: that was a regular',
  'mod.slipped': 'Slipped through',
  'grade.headline': '{n} of {total} attack lines would get past your filters',
  'grade.engine.twitch': 'graded by Twitch',
  'grade.engine.local': 'local estimate',
  'rules.zeroMatches': '0 real-chat matches',
  'rules.rejected': 'Would catch {hits}, but also matches "{example}"',
  'rules.botRule': 'needs a bot rule',
  'fresh.realChat': 'New rules matched {n} of {total} real and harmless messages',
  'push.button': 'Approve and push {n} terms to Twitch',
  'push.undo': 'Undo this push',
  'hate.warning':
    'This tactic uses placeholder slurs shown as solid blocks. Turn it on only if your community is comfortable with the theme.',
  'privacy.short':
    "We keep your chat log for 7 days only to check that new rules don't ban your regulars. Delete it any time.",
  'announce.chat': 'Mod fire drill starting. Practice chat only, nothing here is real.'
} as const;

export type CopyKey = keyof typeof copy;

/** Return a copy string, filling `{name}` placeholders from `values`. */
export function t(key: CopyKey, values: Record<string, string | number> = {}): string {
  return copy[key].replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = values[name];
    return value === undefined ? match : String(value);
  });
}

/**
 * Screen text the PRD describes outside the §9.6 table (landing, demo and privacy pages).
 * Kept here so that all user-facing strings live in one file.
 */
export const pages = {
  appName: 'Mod Fire Drill',
  landing: {
    pitch:
      "Fire drills for your Twitch mods. Practice chat floods with fake scams, spam and bots written to slip past your channel's own blocked terms, then Twitch grades your filters and you fix them.",
    signIn: 'Sign in with Twitch',
    demo: 'Try the demo'
  },
  demo: {
    intro:
      "Try Mod Fire Drill without a Twitch account. You'll get a private practice room with a fake channel, a simulated co-mod and the full loop. Grading in demo rooms is a local estimate; on a real channel, Twitch does the grading.",
    start: 'Start a demo drill',
    phone: 'Open the mod view on my phone'
  },
  privacy: {
    title: 'Privacy',
    stored: 'What is stored',
    storedItems: [
      'Your Twitch profile and your Twitch tokens, encrypted, until you sign out or revoke the app.',
      'Your channel chat log, kept for 7 days only.',
      'Drills and their results, kept for 30 days or until you sign out.',
      'Audit log and report summaries, kept until you sign out.',
      'Demo rooms are deleted 2 hours after their last activity.'
    ],
    neverStored: 'Logs never contain tokens, chat text or attack text.',
    deleteTitle: 'How to delete it',
    deleteItems: [
      'Delete your chat log at any time from step 1 of the console.',
      'Sign out and delete all data from the console to remove everything we hold about your channel.',
      'Revoking the app on Twitch also deletes your data.'
    ]
  },
  placeholder: 'This screen is built in a later ticket.',
  notFound: 'Page not found.',
  back: 'Back to the start',
  nav: { skip: 'Skip to content', privacy: 'Privacy' }
} as const;
