/**
 * Mod track and the shared hub and glossary pages, written by hand.
 * Strings quoted in bold or quotes are the app's own copy (app/src/copy.ts,
 * app/src/routes/Mod.tsx) or the PRD copy deck. Links use "@/" for the site root.
 */
const sample = (label = 'Sample data') => `<span class="tag tag-sample">${label}</span>`;
const frame = (url, inner, label) => `<figure class="mock"><div class="frame"><div class="frame-bar"><span class="frame-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="frame-url">${url}</span>${sample(label)}</div>${inner}</div></figure>`;

const chat = `<div class="frame-chat" role="img" aria-label="Sample practice chat with a caught attack, a false ban, a slipped attack and a line another mod got first.">
<div class="msg caught"><span class="u u1">nitrodrops_93</span><span class="t">fr33 nitro &rarr; nitrodrop.invalid</span><span class="st st-caught">Banned by you &middot; 2.1 s</span></div>
<div class="msg foul"><span class="u u3">grandpa_gamer</span><span class="t">LOL the jump at the end</span><span class="st st-foul">False ban: that was a regular</span></div>
<div class="msg slipped"><span class="u u4">grow_fast_77</span><span class="t">want more v i e w e r s? best promo viewbump .invalid</span><span class="st st-slipped">Slipped through</span></div>
<div class="msg"><span class="u u2">giftsnow_bot</span><span class="t">skins giveaway is live</span><span class="st st-other">Sam got it first</span></div>
</div>`;

export const pages = [
  {
    track: 'mods',
    slug: 'index',
    title: 'Mod docs overview',
    description: 'What a ModScrim drill looks like from a moderator’s side, and the short list of things to know.',
    lead: 'Practise on fake raids without an audience, get a score, and get faster.',
    body: `
<p>Your streamer runs a drill and shares a link and a 6-digit code. You join from any device, clear a practice chat full of generated attacks, and see how you did. Nothing you do touches the real chat.</p>
<h2>Read these in order</h2>
<ol>
<li><a href="@/docs/mods/join.html">Join with the 6-digit code</a></li>
<li><a href="@/docs/mods/practice-chat.html">The practice chat: Delete, Timeout, Ban</a></li>
<li><a href="@/docs/mods/keyboard.html">Keyboard shortcuts</a></li>
<li><a href="@/docs/mods/scoring.html">How scores and outcomes work</a></li>
<li><a href="@/docs/mods/simulated.html">What is simulated, and what you never touch</a></li>
</ol>
<h2>Good to know</h2>
<ul>
<li><strong>It&rsquo;s opt-in.</strong> You only see the practice chat when you join a drill, and it always carries the practice banner.</li>
<li><strong>Works on phones</strong> from 360 pixels wide, where every button is at least 44 pixels tall.</li>
<li><strong>Your name on stream is your streamer&rsquo;s call.</strong> The overlay can show &ldquo;Mod 1&rdquo;, &ldquo;Mod 2&rdquo; instead of names.</li>
</ul>
<p>A shorter version of this track is on the <a href="@/mods.html">For mods</a> page, and you can <a href="@/mod.html">try the mod view preview</a>.</p>
`
  },
  {
    track: 'mods',
    slug: 'join',
    title: 'Join with the 6-digit code',
    description: 'How a moderator joins a ModScrim drill with the mod link, the 6-digit join code and a display name.',
    lead: 'A link, a code and a name. That is all it takes.',
    body: `
${[
  ['1', 'Open the mod link', 'Your streamer shares a link that ends in <code>/mod/</code> and their channel name.'],
  ['2', 'Enter the code and a name', 'Type the 6-digit code and the name you want on the scoreboard, then press <strong>Join</strong>.'],
  ['3', 'Wait for the whistle', '&ldquo;You&rsquo;re in. Remove attacks, leave regulars alone.&rdquo; You&rsquo;ll see who else has joined.']
].map(([n, h, p]) => `<h2>${n}. ${h}</h2><p>${p}</p>`).join('\n')}
<h2>If the code doesn&rsquo;t work</h2>
<ul>
<li>Codes are random for every drill and stop working when the drill ends. Ask your streamer for the current one.</li>
<li>&ldquo;There is no open drill yet. Ask the streamer to start one.&rdquo; means the streamer hasn&rsquo;t opened a drill.</li>
<li>&ldquo;Too many join attempts. Try again in a minute.&rdquo; Codes are rate-limited against guessing.</li>
<li>&ldquo;Your session ended. Enter the code to join again.&rdquo; Your join lasts a limited time in your browser; enter the code again.</li>
</ul>
<p>You need a current browser (Chrome, Edge, Firefox or Safari) and a screen at least 360 pixels wide.</p>
`
  },
  {
    track: 'mods',
    slug: 'practice-chat',
    title: 'The practice chat: Delete, Timeout, Ban',
    description: 'What the ModScrim practice chat looks like and what the Delete, Timeout and Ban actions do in a drill.',
    lead: 'Remove the attacks and leave the regulars alone.',
    body: `
<p>The practice chat always shows the banner &ldquo;Practice chat only. Nothing here is posted to Twitch.&rdquo; Lines arrive every second or so: attacks written to slip past your channel&rsquo;s own filters, mixed with harmless banter from a fixed pool.</p>
<h2>The three actions</h2>
<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Action</th><th>Key</th><th>What it does in a drill</th></tr></thead><tbody>
<tr><td><strong>Delete</strong></td><td><kbd>D</kbd></td><td>Removes the focused line</td></tr>
<tr><td><strong>Timeout</strong></td><td><kbd>T</kbd></td><td>Times out its sender</td></tr>
<tr><td><strong>Ban</strong></td><td><kbd>B</kbd></td><td>Bans its sender</td></tr>
</tbody></table></div>
<p>Every action also has a button. All three only score the drill: nobody real is removed from anything.</p>
<h2>If two mods act on the same line</h2>
<p>Whoever reached the server first gets it. The other mod sees &ldquo;Sam got it first&rdquo; (with that mod&rsquo;s name).</p>
<h2>What each line tells you</h2>
${frame('app.modscrim.dualmindlab.tech/mod/pixelpanda_tv', chat)}
<ul>
<li><strong>Banned by you &middot; 2.1 s</strong>: you caught an attack, and how long you took. (The seconds shown are an example.)</li>
<li><strong>False ban: that was a regular</strong>: you acted on a harmless line.</li>
<li><strong>Slipped through</strong>: nobody acted within the slip window.</li>
</ul>
`
  },
  {
    track: 'mods',
    slug: 'keyboard',
    title: 'Keyboard shortcuts',
    description: 'The keyboard shortcuts of the ModScrim mod view: arrows to move, D to delete, T to time out, B to ban.',
    lead: 'Every mod action works from the keyboard, and focus is always visible.',
    body: `
<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Keys</th><th>What it does</th></tr></thead><tbody>
<tr><td><kbd>&uarr;</kbd> <kbd>&darr;</kbd></td><td>Move between open lines</td></tr>
<tr><td><kbd>Home</kbd> <kbd>End</kbd></td><td>Jump to the first or last open line</td></tr>
<tr><td><kbd>D</kbd></td><td>Delete the focused line</td></tr>
<tr><td><kbd>T</kbd></td><td>Time out its sender</td></tr>
<tr><td><kbd>B</kbd></td><td>Ban its sender</td></tr>
<tr><td><kbd>?</kbd></td><td>Show the keyboard help</td></tr>
</tbody></table></div>
<p>The same actions are available as buttons on every line, which is what you use on a phone. Score changes and slipped lines are announced politely to screen readers.</p>
`
  },
  {
    track: 'mods',
    slug: 'scoring',
    title: 'How scores and outcomes work',
    description: 'What caught, false ban, slipped and reaction time mean in a ModScrim drill and how the first action wins.',
    lead: 'Four words cover almost everything you will see on the scoreboard.',
    body: `
<dl class="gloss">
<div><dt>Caught</dt><dd>You acted on an attack line.</dd></div>
<div><dt>False ban</dt><dd>You acted on a banter line, which was a regular. It is shown as &ldquo;False ban: that was a regular&rdquo;.</dd></div>
<div><dt>Slipped</dt><dd>An attack line nobody removed within the slip window (9 seconds by default; your streamer can set 5 to 15). Banter never slips. Slipped lines are what the filters need to catch.</dd></div>
<div><dt>Reaction time</dt><dd>How long you took, from when the line appeared to when you acted.</dd></div>
</dl>
<h2>The first action wins</h2>
<p>If two mods act on the same line, whoever reached the server first gets the credit.</p>
<h2>At the end</h2>
<p>You see your caught, false bans and average reaction time, the team scoreboard, and the reveal: which lines were attacks and which tricks they used. The reveal is for the console and mods; it is never shown on the overlay.</p>
<p>Today each drill has its own report; a mod-history view across drills is planned.</p>
`
  },
  {
    track: 'mods',
    slug: 'simulated',
    title: 'What is simulated, and what you never touch',
    description: 'Which parts of a ModScrim drill are simulated, and why nothing a mod does reaches the real Twitch chat.',
    lead: 'The attacks are generated and Kai is a simulation. The only real thing is your practice.',
    body: `
<h2>What is simulated</h2>
<ul>
<li><strong>The attacks.</strong> Every attack line is generated. Every link ends in <code>.invalid</code>, so it can&rsquo;t open. Slurs, if the streamer turns that tactic on, are placeholders drawn as solid blocks.</li>
<li><strong>The banter.</strong> The harmless lines come from a curated pool, never from real viewers&rsquo; messages.</li>
<li><strong>Kai (sim).</strong> A simulated co-mod for rehearsing alone. It acts on about 60% of attacks after a few seconds and sometimes on tempting banter, so you can see a false ban happen. It is always labelled &ldquo;(sim)&rdquo; and scored separately.</li>
<li><strong>The demo room.</strong> If you are in a demo room, the channel and its chat log are sample data and its grades are a labelled local estimate.</li>
</ul>
<h2>What you never touch</h2>
<ul>
<li>Nothing is posted to the real chat. The only message ModScrim can ever send is an optional fixed line when a drill starts, and it never contains attack text.</li>
<li>Delete, Timeout and Ban only score the drill. Nobody real is removed from anything.</li>
<li>You never see your streamer&rsquo;s chat log, tokens or blocked terms.</li>
<li>Viewers see an overlay where every attack message is a blurred bar. They never learn a working trick.</li>
</ul>
<p>The full list is on the <a href="@/safety.html">safety page</a>.</p>
`
  }
];

const card = (href, h, who, text) =>
  `<li><a class="dcard" href="${href}"><b>${h}</b><span><em class="who">${who}</em>${text}</span><em class="go">Open the ${h.toLowerCase()}</em></a></li>`;

export const hub = {
  track: null,
  slug: 'index',
  title: 'Documentation',
  description: 'ModScrim documentation for streamers, moderators and developers, in three separate tracks.',
  lead: 'Three tracks, one for each way you might use ModScrim. Start with the one that sounds like you.',
  body: `
<h2 id="which">Which docs are for me?</h2>
<ul class="dcards chooser">
${card('@/docs/streamer/', 'Streamer docs', 'I run a Twitch channel. ', 'Connect Twitch, set up a drill and OBS, read the grades, push blocked terms and undo them.')}
${card('@/docs/mods/', 'Mod docs', 'I moderate a channel. ', 'Join with a code, clear the practice chat, learn the keys and how scores work.')}
${card('@/docs/dev/', 'Developer docs', 'I want to read or change the code. ', 'Architecture, running it locally, contracts, deployment, testing, the design system and contributing.')}
</ul>
<h2>In a hurry</h2>
<ul>
<li><a href="@/docs/streamer/quick-start.html">Quick start for streamers</a>, about three minutes.</li>
<li><a href="@/demo.html">Try a demo room</a>, no Twitch account needed.</li>
<li><a href="@/safety.html">Safety</a>, what ModScrim will never do.</li>
</ul>
<h2>Reference</h2>
<ul>
<li><a href="@/docs/glossary.html">Glossary</a>: caught, slipped, false ban, fresh wave, local estimate and more.</li>
<li><a href="@/faq.html">FAQ</a>: short answers.</li>
<li><a href="@/privacy.html">Privacy policy</a> and <a href="@/terms.html">Terms of use</a>.</li>
</ul>
<p class="fine">ModScrim is free and open source under the MIT licence. The product requirements (PRD) and engineering specification (SRS) live in <a href="https://github.com/harshbhx/modscrim/tree/main/docs/for-agents">the repository</a>.</p>
`
};

const G = [
  ['Drill', 'One practice session: a wave of generated lines played into the practice chat.'],
  ['Practice chat', 'The sandboxed chat your mods work in. It is never posted to Twitch.'],
  ['Attack line', 'A generated scam, spam, bot or placeholder-hate line that mods should remove.'],
  ['Banter line', 'A harmless line from a curated pool that mods should leave alone.'],
  ['Tactic', 'A family of attacks: fake giveaway links, follower and viewer spam, art and promo bots, and placeholder hate-raid lines (off by default).'],
  ['Trick', 'A change that helps an attack slip past filters, such as caps, number swaps, stretched letters, spaced letters, dotted letters or look-alike letters.'],
  ['Caught', 'An attack line a mod acted on.'],
  ['Slipped', 'An attack line no mod removed within the slip window (9 seconds by default). Banter never slips.'],
  ['False ban', 'A mod action on a banter line.'],
  ['Reaction time', 'How long a mod took to act on a line after it appeared.'],
  ['Check AutoMod Status', 'The Twitch feature that says whether a message would be permitted by your channel&rsquo;s current AutoMod settings and blocked terms. ModScrim uses it to grade your filters.'],
  ['Graded by Twitch', 'The grade came from Twitch&rsquo;s own Check AutoMod Status.'],
  ['Local estimate', 'The grade came from ModScrim&rsquo;s own matcher: always in demo rooms, and on a real channel when Twitch&rsquo;s hourly limit is used up.'],
  ['Blocked terms', 'The words and phrases your channel blocks on Twitch. ModScrim sees only your public terms.'],
  ['AutoMod', 'Twitch&rsquo;s automatic filter, with category levels. ModScrim reads these levels and never changes them.'],
  ['Needs a bot rule', 'A trick no blocked term can express, such as spaced letters, dotted letters or look-alike letters.'],
  ['Rule finder', 'The code that proposes up to six blocked terms from the attack lines that got past your filters.'],
  ['Real-chat matches', 'How many of your recent real chat lines a proposed term would match. It must be zero before you can push.'],
  ['Rejected term', 'A proposed term that catches attacks but would also match a real chat line, shown with that line as the example.'],
  ['Fresh wave', 'A new wave of 30 attack lines built with tricks the rule finder never saw, used to prove the new terms. Also called the held-out wave.'],
  ['Push', 'Adding the terms you approved to your channel&rsquo;s blocked terms on Twitch. Nothing is pushed without your approval.'],
  ['Undo', 'Removing every term a drill&rsquo;s push added. Terms that already existed are left alone.'],
  ['Kai (sim)', 'A simulated co-mod for rehearsing alone. Always labelled, and scored separately.'],
  ['Join code', 'Six random digits that let a mod join the current drill.'],
  ['Overlay', 'The viewer-safe page you add to OBS as a Browser source. It only receives redacted data.'],
  ['Overlay key', 'The private 32-character key in the overlay URL. Rotate it if the URL leaks.'],
  ['Reveal', 'After a drill, which lines were attacks and which tricks they used. Visible in the console and to mods, never on the overlay.'],
  ['After-action report', 'The summary of one drill: scores, grades, rules, proof and pushes.'],
  ['Report card', 'The numbers-only part of the report, safe for the overlay and share links.'],
  ['Demo room', 'A temporary private room with a sample channel, so you can run the whole loop without a Twitch account.']
];

export const glossary = {
  track: null,
  slug: 'glossary',
  title: 'Glossary',
  description: 'Plain-language meanings for the terms ModScrim uses: caught, slipped, false ban, fresh wave, local estimate and more.',
  lead: 'The words you will see in a drill and its report, in plain language.',
  body: `<dl class="gloss">${G.map(([t, d]) => `<div><dt>${t}</dt><dd>${d}</dd></div>`).join('')}</dl>
<p class="fine" style="margin-top:24px">Looking for engineering terms such as room, phase or engine? See the <a href="https://github.com/harshbhx/modscrim/blob/main/docs/glossary.md">developer glossary</a>.</p>`
};
