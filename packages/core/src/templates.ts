import type { Tactic } from './types.js';

export const TACTICS: Record<Tactic, { label: string; hosts: readonly string[]; templates: readonly string[] }> = {
  linkscam: {
    label: 'Fake giveaway links',
    hosts: ['nitrodrop', 'freebits', 'giftsnow'],
    templates: [
      '^free {gift} for the first 50 viewers → {link}',
      '{gift} ^giveaway is live, ^claim yours at {link}',
      'streamer is gifting {gift}!! grab it {link}',
      'get {gift} ^free before it ends {link}'
    ]
  },
  spam: {
    label: 'Follower and viewer spam',
    hosts: ['twitchgrow', 'viewbump'],
    templates: [
      '^buy ^followers and ^viewers cheap at {link}',
      'want more ^viewers? best ^promo {link}',
      'grow your channel fast, real ^followers {link}'
    ]
  },
  botwave: {
    label: 'Art and promo bots',
    hosts: [],
    templates: [
      'hey streamer, need ^emotes or ^overlays? ^dm me',
      'nice stream! I do ^promotion, check your ^dms',
      'hi, I make ^chibi logos for streamers, ^dm me'
    ]
  },
  hateraid: {
    label: 'Hate raid (placeholder slurs)',
    hosts: [],
    templates: ['{slur} {slur} get out of here', 'this streamer is a {slur}', 'everyone spam {slur} now']
  }
};

export const GIFTS = ['nitro', 'skins', 'bits', 'subs', 'vbucks', 'robux'] as const;
export const SLURS = ['slurx', 'slury'] as const;
export const BOT_PREFIX = ['xq', 'promo', 'free', 'zz', 'v1ew', 'gr0w', 'art', 'gift', 'drop'] as const;
export const REGULARS = ['mossy_mae', 'tobi_404', 'lunarferret', 'gr8tdane', 'pinecone_pal', 'juniper_j', 'olliebytes'] as const;

/** Curated harmless lines; this pool never contains real chat. */
export const BANTER: readonly string[] = [
  "i'm gonna kill this boss", 'free real estate lol', 'this game is a scam honestly', 'giveaway when?',
  'drop the link to your playlist pls', 'chat is spamming emotes again', 'that streamer is a menace',
  'bro got scammed by that npc', 'nitro boost is broken in this game', "who does your overlays? they're clean",
  "I'll dm you the build later", 'followers only mode was on earlier?', 'can someone link the patch notes',
  'free dlc dropped today', 'claim the daily reward before reset', 'the promo trailer looked sick',
  'my viewers in discord say hi', "who made your emotes? they're so good", 'buying the deluxe edition after this',
  'subs only chat was a vibe earlier', 'gift sub hype!', 'the free weekend ends tonight right?',
  'that dm from the npc was hilarious', "followers goal almost hit, let's go", 'promote the speedrun community pls',
  'skins in this game are so pricey', 'is the shop link in the panels?', 'robux jokes are back lol',
  'the giveaway last month was so fun', 'check the pinned message for the schedule',
  'your overlay alerts are clean today', 'bits incoming for the death counter', 'the merchant is scamming us again',
  'nitro joke incoming in 3 2 1', 'get the grappling hook first', 'stream art for the emote contest is due friday',
  'viewers please be nice to the new folks', 'dot dot dot the boss is back', 'that link in the panels is broken btw',
  'chibi version of the boss when'
];
