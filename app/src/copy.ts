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

/** The public website. Its privacy policy and terms are the only copies; the app links to them. */
export const SITE_URL = 'https://modscrim.dualmindlab.tech';

/**
 * Screen text outside the PRD §9.6 table (app chrome, landing, demo and privacy pages).
 * Kept here so that all user-facing strings live in one file. The product is named
 * ModScrim in the UI, as on the website (brand kit decision); the PRD's working name
 * stays only inside the exact §9.6 strings.
 */
export const pages = {
  appName: 'ModScrim',
  tagline: 'Raid drills for your mod team.',
  nav: {
    skip: 'Skip to content',
    home: 'ModScrim home',
    main: 'Main',
    privacy: 'Privacy',
    footer: 'More about ModScrim',
    website: 'Website',
    terms: 'Terms of use',
    source: 'Source code',
    notTwitch: 'ModScrim is not affiliated with or endorsed by Twitch.'
  },
  landing: {
    title: 'Raid drills for your mod team.',
    pitch:
      "ModScrim floods a practice chat that only your team can see with spam built to slip past your channel's own filters. Your mods race to clear it. Then Twitch grades your filters, and the blocked terms that close the gaps go live when you approve them, with one-click undo.",
    signIn: 'Sign in with Twitch',
    demo: 'Try the demo'
  },
  demo: {
    intro:
      "Try ModScrim without a Twitch account. You'll get a private practice room with a fake channel, a simulated co-mod and the full loop. Grading in demo rooms is a local estimate; on a real channel, Twitch does the grading.",
    start: 'Start a demo drill',
    phone: 'Open the mod view on my phone'
  },
  privacy: {
    title: 'Privacy',
    lead: 'What ModScrim stores, why, for how long, and how to delete it.',
    full: 'The full privacy policy lists everything ModScrim stores, why, how long each item is kept, who else handles it, and how to delete it. It is kept in one place, on the ModScrim website, so the app and the site never disagree.',
    link: 'Read the privacy policy',
    deleteNote:
      'You can delete the chat log at any time, pause logging, or delete everything by signing out.',
    contact: 'Questions about your data:',
    email: 'team@dualmindlab.tech'
  },
  screens: {
    console: 'Console',
    mod: 'Mod console',
    overlay: 'Overlay',
    demo: 'Demo',
    demoConsole: 'Demo console',
    demoMod: 'Demo mod view',
    report: 'Report'
  },
  placeholder: 'This screen is built in a later ticket.',
  notFound: 'Page not found.',
  back: 'Back to the start'
} as const;
