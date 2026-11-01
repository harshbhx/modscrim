/**
 * Streamer track, written by hand for the audience. Facts come from the PRD,
 * the existing site pages and the app copy deck; nothing here describes a
 * feature the repository does not have. Links use "@/" for the site root.
 */
const APP = 'https://app.modscrim.dualmindlab.tech';
const sample = (label = 'Sample data') => `<span class="tag tag-sample">${label}</span>`;
const frame = (url, inner, label) => `<figure class="mock"><div class="frame"><div class="frame-bar"><span class="frame-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="frame-url">${url}</span>${sample(label)}</div>${inner}</div></figure>`;
const steps = (items) =>
  `<ol class="qsteps">${items.map(([h, p]) => `<li><div><h3>${h}</h3><p>${p}</p></div></li>`).join('')}</ol>`;

export const pages = [
  {
    track: 'streamer',
    slug: 'index',
    title: 'What ModScrim is for',
    description: 'ModScrim runs raid drills for a Twitch channel’s mod team and tests your blocked terms. What it does and what it never does.',
    lead: 'ModScrim runs raid drills for your mod team, then tests and improves your channel’s own filters.',
    body: `
<h2>The idea</h2>
<p>A practice chat floods with generated scam, spam and bot lines written to slip past <strong>your channel&rsquo;s own blocked terms</strong>, mixed with harmless banter. Your mods race to remove the attacks. Then Twitch grades your filters, a rule finder proposes up to six new blocked terms, and the terms are proven on a fresh wave of attacks with zero matches against your real chat. You push them to Twitch with one click, and you can undo.</p>
<h2>What a drill gives you</h2>
<ul>
<li><strong>Trained mods.</strong> Each mod gets caught, false bans and average reaction time.</li>
<li><strong>A number for your filters.</strong> &ldquo;9 of 14 attack lines would get past your filters&rdquo;, graded by Twitch&rsquo;s Check AutoMod Status. The 9 of 14 is an example; yours comes from your own channel.</li>
<li><strong>Rules you can trust.</strong> Each proposed term is checked against your last 7 days of chat, so it can&rsquo;t ban a regular.</li>
</ul>
<h2>What it never does</h2>
<ul>
<li>It never posts attack text to your chat. The only message it can send is one optional fixed line when a drill starts, and it is off unless you turn it on.</li>
<li>It never changes your AutoMod settings. It only reads them.</li>
<li>It never adds a blocked term without your approval, and every push can be undone.</li>
</ul>
<p>Every generated link ends in <code>.invalid</code>, so it can&rsquo;t open. Read the full list on the <a href="@/safety.html">safety page</a>.</p>
<h2>How long it takes</h2>
<p>The drill itself runs 30 seconds to 3 minutes. From the first whistle to the report is usually under six minutes. Setup takes about three minutes, and nothing needs installing.</p>
<h2>Start here</h2>
<p>Follow the <a href="@/docs/streamer/quick-start.html">quick start</a>, or <a href="@/demo.html">try a demo room</a> first. No Twitch account is needed for the demo, and its grades are a labelled local estimate.</p>
`
  },
  {
    track: 'streamer',
    slug: 'quick-start',
    title: 'Quick start',
    description: 'Sign in, invite your mods, add the overlay and run your first ModScrim drill in about three minutes.',
    lead: 'Five steps from sign-in to your first approved blocked term. Plan on about three minutes.',
    body: `
<p>No Twitch account yet, or just curious? <a href="@/demo.html">Run the whole loop in a demo room first</a>. Nothing to install in either case.</p>
${steps([
  ['Sign in with Twitch', 'Open the console and press <strong>Sign in with Twitch</strong>. Twitch lists the permissions ModScrim needs and why. ModScrim then reads your public blocked terms and AutoMod levels, and starts a 7-day chat log used only to check that new rules won&rsquo;t ban your regulars. AutoMod stays read-only.'],
  ['Invite your mods', 'In step 2, copy the <strong>mod link</strong> and send it with the 6-digit <strong>join code</strong>. No mods online? Turn on <strong>Kai (sim)</strong> to rehearse with a simulated co-mod.'],
  ['Add the overlay to OBS (optional)', 'Copy the <strong>overlay URL</strong>, add a <strong>Browser</strong> source in OBS and set it to 1920 by 1080. It stays transparent until a drill starts, and viewers only ever see blurred attack text.'],
  ['Start the drill', 'Pick the tactics and press <strong>Start drill</strong>. Your mods delete, time out or ban the attacks and leave regulars alone. Everything is labelled practice.'],
  ['Fix your filters', 'After the final whistle, <strong>Twitch grades</strong> your filters, the rule finder proposes up to six blocked terms, and a <strong>fresh wave</strong> proves them. Press <strong>Approve and push</strong> when you are happy. Nothing reaches Twitch before that, and <strong>Undo this push</strong> removes it again.']
])}
<div class="ctas" style="margin-top:32px"><a class="btn btn-orange" href="${APP}/console">Start a drill</a><a class="btn btn-line-dark" href="@/demo.html">Open a demo room</a></div>
`
  },
  {
    track: 'streamer',
    slug: 'connect-twitch',
    title: 'Connect Twitch',
    description: 'What happens when you sign in to ModScrim with Twitch, which permissions it asks for and why, and how to disconnect.',
    lead: 'One sign-in connects your channel. Here is what ModScrim asks for, and what it does with it.',
    body: `
<h2>Sign in</h2>
<p>Press <strong>Sign in with Twitch</strong>. Twitch shows its own consent screen with the permissions ModScrim needs and why. After you approve, the console shows your channel name, avatar and &ldquo;Connected&rdquo;.</p>
<p>ModScrim then reads your public blocked terms and AutoMod levels and starts the chat log. Step 1 of the console shows &ldquo;Chat log: 0 messages, collecting since&rdquo; the time you signed in. The false-ban check gets better as the log grows; until then ModScrim uses its banter pool.</p>
<h2>Permissions</h2>
<p>ModScrim asks for the smallest set of permissions the loop needs.</p>
<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Permission</th><th>Why ModScrim asks</th><th>Used in</th></tr></thead><tbody>
<tr><td><code>moderator:read:blocked_terms</code></td><td>Read your public blocked terms</td><td>Step 1, Read filters</td></tr>
<tr><td><code>moderator:manage:blocked_terms</code></td><td>Add the terms you approve, and remove them when you press Undo</td><td>Step 6, push and undo</td></tr>
<tr><td><code>moderator:read:automod_settings</code></td><td>Read your AutoMod levels. ModScrim never changes them</td><td>Step 1, Read filters</td></tr>
<tr><td><code>moderation:read</code></td><td>Check attack lines against your filters with Check AutoMod Status, and see who your mods are</td><td>Step 4 and mod sign-in</td></tr>
<tr><td><code>user:read:chat, user:bot, channel:bot</code></td><td>Receive your channel&rsquo;s chat for the 7-day false-ban check</td><td>Step 1 and Step 5</td></tr>
<tr><td><code>user:write:chat</code></td><td>Post one fixed line when a drill starts. Requested only if you turn the announcement on</td><td>Optional</td></tr>
</tbody></table></div>
<h2>What stays private</h2>
<ul>
<li>Your Twitch tokens are encrypted at rest and used only on the server. They never reach a browser.</li>
<li>Twitch doesn&rsquo;t share your private blocked terms with apps, so ModScrim can only see and test the public ones.</li>
</ul>
<h2>Disconnect</h2>
<p>Use <strong>Sign out and delete my data</strong> to remove your tokens, chat log, drills, reports and chat subscription. If you remove ModScrim from your Twitch connections instead, ModScrim deletes the same data once Twitch tells it about the change. See <a href="@/docs/streamer/push-and-undo.html#remove-everything">remove everything</a>.</p>
<p>If the console says &ldquo;Reconnect Twitch&rdquo;, your token needs refreshing: sign in again.</p>
`
  },
  {
    track: 'streamer',
    slug: 'console-walkthrough',
    title: 'Console walkthrough',
    description: 'The six steps of the ModScrim streamer console, one by one: read filters, configure, run the drill, Twitch grades, fix the rules, fresh wave and push.',
    lead: 'The console has six steps, shown as tabs along the top. Here is what each one does.',
    body: `
<p>You can move between steps at any time. The mockups below use sample data from the demo channel; yours shows your own filters, chat and grades. You can also <a href="@/console.html">click through the console preview</a>.</p>
<h2 id="s1">1. Read filters</h2>
<p>What your channel blocks today, read from Twitch. ModScrim tests these and never changes your AutoMod settings.</p>
<ul>
<li><strong>Public blocked terms.</strong> Twitch doesn&rsquo;t share private blocked terms with apps, so they aren&rsquo;t shown or tested. <strong>Refresh from Twitch</strong> reads them again.</li>
<li><strong>Chat log.</strong> The number of messages, when collecting started, and that they are kept for 7 days. Recent lines are blurred until you hover or focus them. <strong>Delete chat log</strong> and <strong>Pause logging</strong> are here.</li>
<li><strong>AutoMod levels.</strong> Read only. Change these in your Twitch moderation settings.</li>
</ul>
<h2 id="s2">2. Configure</h2>
<p>The join code already works while you change settings, so mods can join now.</p>
<ul>
<li><strong>Tactics:</strong> Fake giveaway links, Follower and viewer spam, Art and promo bots, and Hate raid (placeholder slurs), which is off by default and shows a content warning.</li>
<li><strong>Numbers:</strong> attack lines (6 to 30, at most 40 lines in total), banter lines (4 to 20), seconds between lines (0.8 to 3.0) and the slip window (5 to 15 seconds).</li>
<li><strong>Kai (sim)</strong>, a simulated co-mod, always labelled and scored separately.</li>
<li><strong>Invite your mods:</strong> the join code and the mod link. <strong>OBS overlay:</strong> the overlay URL, <strong>Rotate key</strong>, <strong>Preview the overlay</strong> and <strong>Hide mod names on the overlay</strong>.</li>
</ul>
<h2 id="s3">3. Run the drill</h2>
<p>The same practice chat your mods see. You can act too, or just watch the scoreboard. Press <strong>Start drill</strong>. Anything nobody removes within the slip window slips through.</p>
${frame(
  'app.modscrim.dualmindlab.tech/console',
  `<div class="sb" role="group" aria-label="Scoreboard, sample"><span class="sb-tag">Practice</span><div class="slot slot-mods"><span class="slot-l">Mods</span><span class="plates"><span class="pl"></span><span class="pl">3</span></span></div><div class="slot slot-raid"><span class="slot-l">Raid</span><span class="plates"><span class="pl"></span><span class="pl">1</span></span></div><div class="slot slot-fouls"><span class="slot-l">Fouls</span><span class="plates"><span class="pl">1</span></span></div></div><div class="frame-chat" role="img" aria-label="Sample practice chat"><div class="msg caught"><span class="u u1">nitrodrops_93</span><span class="t">fr33 nitro for the first 50 viewers &rarr; nitrodrop.invalid</span><span class="st st-caught">Caught</span></div><div class="msg slipped"><span class="u u4">grow_fast_77</span><span class="t">want more v i e w e r s? best promo viewbump .invalid</span><span class="st st-slipped">Slipped through</span></div></div>`
)}
<h2 id="s4">4. Twitch grades</h2>
<p>Every attack line from the drill is checked against your current filters with Twitch&rsquo;s Check AutoMod Status. You see one plain number and a line-by-line table with the tactic and trick each line used. See <a href="@/docs/streamer/grades-and-report.html">reading the grades</a>.</p>
<h2 id="s5">5. Fix the rules</h2>
<p>Terms that catch what got past, checked against your last 7 days of chat and the banter pool. Any term that would match a regular is rejected.</p>
<ul>
<li><strong>Proposed:</strong> up to six terms, each with its real-chat matches (must be zero) and an example line it catches. Untick any you don&rsquo;t want.</li>
<li><strong>Add your own term:</strong> 2 to 500 characters; a <code>*</code> may appear only at the start or end of a word.</li>
<li><strong>Rejected:</strong> terms that would ban a regular, with the line they matched.</li>
<li><strong>Needs a bot rule:</strong> tricks blocked terms can&rsquo;t express, such as spaced letters. Use a moderation bot for those.</li>
</ul>
${frame(
  'app.modscrim.dualmindlab.tech/console',
  `<div class="frame-body"><div class="rulecard"><header><b>Proposed</b><span class="micro muted">Sample terms</span></header><ul class="rulelist"><li><div class="what"><span class="kind">Catches 2</span><code>giftsnow*</code></div><div class="acts"><span class="state state-ready">0 real-chat matches</span></div></li><li><div class="what"><span class="kind">Rejected: matches a regular&rsquo;s &ldquo;dm me the build later&rdquo;</span><code>dm me</code></div><div class="acts"><span class="state state-bad">Would ban a regular</span></div></li></ul></div></div>`
)}
<h2 id="s6">6. Fresh wave and push</h2>
<p>30 new attacks from a new seed, built with tricks the rule finder never saw. You see how many your filters block before and after, what still gets through, and that the new rules matched zero real messages. Then <strong>Approve and push</strong> sends the terms you ticked to Twitch. <strong>Undo this push</strong> removes them. See <a href="@/docs/streamer/push-and-undo.html">approve, push and undo</a>.</p>
`
  },
  {
    track: 'streamer',
    slug: 'grades-and-report',
    title: 'Reading the grades and the report',
    description: 'How to read ModScrim’s Twitch grade, the local estimate label, the fresh-wave proof and the numbers-only after-action report.',
    lead: 'What each number means, who produced it, and what the report shares.',
    body: `
<h2>The Twitch grade</h2>
<p>&ldquo;9 of 14 attack lines would get past your filters&rdquo; means that, for 14 attack lines in the drill, Twitch&rsquo;s own Check AutoMod Status said your current AutoMod settings and blocked terms would let 9 through. The 9 of 14 is an example from the product, not a measurement of any channel. A lower number is better.</p>
<p>The label next to a number tells you who produced it:</p>
<ul>
<li><strong>graded by Twitch:</strong> Twitch&rsquo;s Check AutoMod Status.</li>
<li><strong>local estimate:</strong> ModScrim&rsquo;s own matcher. Demo rooms always use it, and a real channel uses it for the lines left over when Twitch&rsquo;s hourly limit runs out. ModScrim tells you when Twitch grading resumes.</li>
</ul>
<p>Twitch limits checks per channel: 5 a minute and 50 an hour for most channels, 10 and 100 for affiliates, and 30 and 300 for partners.</p>
<h2>Needs a bot rule</h2>
<p>Some tricks can&rsquo;t be written as a blocked term: spaced letters, dotted letters, look-alike letters, a space or <code>[.]</code> in a link, and &ldquo;dot&rdquo; spelled out. These lines are listed as &ldquo;needs a bot rule&rdquo;. A moderation bot such as Sery_bot, Fossabot or Nightbot can handle them.</p>
<h2>The fresh-wave proof</h2>
<p>Before anything is pushed, ModScrim builds a second wave of 30 attacks from a new seed, using tricks the rule finder never saw. It shows how many were blocked before and after, what still gets through, and how many of your real messages the new rules would match. Push stays disabled unless that number is zero.</p>
<p>The fresh-wave result is a <strong>local estimate</strong>. On a real channel, Twitch re-grades the fresh wave after the push, and the report shows how often Twitch and the local matcher agreed.</p>
<h2>The after-action report</h2>
<p>One drill, summarised: scores per mod (caught, false bans, average reaction), the Twitch grade, the terms pushed and the fresh-wave result. Open the <a href="@/report.html">sample report</a> to see the layout; its numbers are examples.</p>
<h2>What a share link carries</h2>
<p>Numbers only. Attack lines, chat lines and evasion details stay in your console, and share links never include them. The overlay shows an after-action card for 20 seconds after the drill.</p>
`
  },
  {
    track: 'streamer',
    slug: 'push-and-undo',
    title: 'Approve, push, undo and remove everything',
    description: 'How pushing blocked terms to Twitch works in ModScrim, how to undo a push, and how to delete all your data.',
    lead: 'Nothing reaches your channel until you press the button, and everything can be taken back.',
    body: `
<h2>Approve and push</h2>
<p>In step 6, <strong>Approve and push</strong> adds the terms you ticked in step 5 to your channel&rsquo;s blocked terms on Twitch. The button is disabled unless the proposed terms match none of your real chat from the last 7 days. No term reaches Twitch without your explicit approval.</p>
<p>ModScrim never calls Twitch&rsquo;s AutoMod settings update, which overwrites every setting at once. It only reads your levels.</p>
<h2>Undo this push</h2>
<p><strong>Undo this push</strong> removes every term that drill&rsquo;s push added. A term that already existed on Twitch before the push is left alone. You can press it from the console or from that drill&rsquo;s report. You can also remove any term yourself in your Twitch dashboard.</p>
<h2 id="remove-everything">Remove everything</h2>
<ul>
<li><strong>Chat log:</strong> press <strong>Delete chat log</strong> in step 1 at any time, or <strong>Pause logging</strong>. It is otherwise kept for 7 days.</li>
<li><strong>Overlay URL:</strong> press <strong>Rotate key</strong> and old links stop working at once.</li>
<li><strong>Everything:</strong> <strong>Sign out and delete my data</strong> removes your tokens, chat log, drills, reports and chat subscription. Removing ModScrim from your Twitch connections does the same once Twitch tells ModScrim about the change.</li>
<li><strong>Audit log:</strong> pushes, undos, sign-ins, sign-outs, chat-log deletions and overlay key changes are written to your audit log.</li>
</ul>
<p>See the <a href="@/privacy.html">privacy policy</a> for what is stored and for how long.</p>
`
  },
  {
    track: 'streamer',
    slug: 'troubleshooting',
    title: 'Troubleshooting',
    description: 'Fixes for a blank overlay, a join code that fails, a disabled push button, a local estimate grade and more.',
    lead: 'The things that most often look wrong, and what to do about each one.',
    body: `
<div class="faq">
${[
  ['The overlay is blank', 'The overlay stays transparent until a drill starts. If a drill is running and it is still blank, the key may have been rotated: copy the current overlay URL from step 2 of the console. A wrong or rotated key shows nothing at all, by design.'],
  ['A mod cannot join with the code', 'Join codes are random for every drill, stop working when the drill ends and are rate-limited against guessing. Check that the drill is still running, then share the current code. The mod view needs a current browser and a screen at least 360 pixels wide.'],
  ['Approve and push is disabled', 'Push stays disabled unless the proposed terms match none of your real chat from the last 7 days. A rejected term shows the line it would have caught by mistake. Until your chat log has grown, ModScrim also uses its banter pool for the check.'],
  ['The grade says &ldquo;local estimate&rdquo;', 'Demo rooms never call Twitch, so their grades are always a local estimate. On a real channel it appears when Twitch&rsquo;s hourly grading limit is used up, and ModScrim tells you when Twitch grading resumes.'],
  ['&ldquo;Reconnect Twitch&rdquo;', 'ModScrim checks your token every hour. If you changed your password or removed the app on Twitch, sign in again.'],
  ['The chat log is not growing', 'The status strip shows the chat subscription and the time of the last message. Broken subscriptions are repaired every hour; you can also repair one from the status strip.'],
  ['A pushed term turned out to be wrong', 'Press <strong>Undo this push</strong> in that drill&rsquo;s report, or remove the term in your Twitch dashboard.'],
  ['I leaked the overlay URL', 'Press <strong>Rotate key</strong>. Old links stop working at once and show nothing.'],
  ['My demo room disappeared', 'A demo room is private to your browser and deletes itself two hours after its last activity. Start a new one from the demo page.']
]
  .map(([q, a]) => `<details><summary>${q}</summary><div class="ans"><p>${a}</p></div></details>`)
  .join('\n')}
</div>
<p class="fine" style="margin-top:32px">Still stuck? <a href="https://github.com/harshbhx/modscrim/issues">Report a problem</a> in the repository. Never paste a Twitch token or an overlay URL there.</p>
`
  }
];
