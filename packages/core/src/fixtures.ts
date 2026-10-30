import type { DrillConfig } from './types.js';

export const DEMO_CHANNEL = {
  broadcasterId: 'demo',
  login: 'pixelpanda_tv',
  displayName: 'pixelpanda_tv',
  broadcasterType: '' as const
};

export const DEMO_TERMS: readonly string[] = ['free nitro', 'bit.ly', 'buy followers', 'slurx', 'freebits'];

export const DEFAULT_CONFIG: DrillConfig = {
  tactics: ['linkscam', 'spam', 'botwave'],
  primaryTactic: 'linkscam',
  attackCount: 14,
  banterCount: 8,
  intervalMs: 1500,
  slipWindowMs: 9000,
  seed: 7,
  simMod: true
};

export const demoBootstrap = (roomName: string) => ({ mode: 'demo' as const, roomName, ...DEMO_CHANNEL });

/** 71 curated lines standing in for a real channel's chat. Keep the `invalid` example; no line equals banter. */
export const FIXTURE_CHAT: readonly string[] = [
  'lmao the boss one-shot you again', 'gg that was clean', 'free real estate', 'is the dlc free or paid?', 'giveaway when chat',
  "I'd buy that skin tbh", 'those bits were so worth it', 'thanks for the subs everyone', 'new skins look clean', 'nitro boost in this game is broken lol',
  'that move was invalid lol', 'check the clip mods', 'can you dm me the build later', 'first time here, love the vibes', 'my followers would love this game',
  'viewers count is climbing', 'promo code from the game site works', 'claim the daily reward first', 'link the map mod pls', 'emotes in this chat are elite',
  'your overlays look so good', 'who made your emotes', 'drop the playlist link', 'streamer is a legend', 'this boss is a scam honestly',
  'KEKW', 'hydrate check', 'the warden has two phases right?', 'you missed the chest on the left', 'robux jokes again chat lol',
  'vbucks were never the answer', 'I gifted 5 subs earlier', 'how many deaths now', '52 deaths and counting', 'chat be nice to the new folks',
  'welcome raiders!', 'that raid was huge', 'the lighting in this area is so good', 'mods asleep post frogs', 'no spoilers please',
  'this soundtrack slaps', 'bro got scammed by that npc again', 'the merchant prices are a scam', 'free dlc dropped today btw', 'is nitro worth it for discord',
  'cheap trick by the boss', 'followers only mode was on earlier right?', 'subs get the new emote tomorrow', 'bits for the death counter', 'claim the bonus chest after the boss',
  'steam sale is live btw', 'steam gifts arrived for my brother', 'the promo art is beautiful', 'dm me your settings later', "i'm gonna kill this boss for you",
  "that's an invalid build lol", 'good night everyone', 'what game next stream', 'overlays guy did a great job', 'grow mushrooms in the garden first',
  'the views from the tower are amazing', 'lurking but here', 'stream sounded great today', 'this guy is a menace', 'need more potions before the boss',
  'chibi art of the warden would go hard', 'real ones remember the first run', 'get the shield upgrade first', 'promotion to boss slayer incoming', 'best run so far', 'twitch chat is wild today'
];
