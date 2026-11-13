import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Callout, Code } from "./ui";

export interface Deployment {
  readonly table: string;
  readonly deck: string;
  readonly score: string;
  readonly radio: string;
  readonly lobby: string;
  readonly takeover: string;
  readonly block: number;
}

export interface DocPage {
  readonly slug: string;
  readonly group: string;
  readonly title: string;
  readonly summary: string;
  readonly headings: readonly { readonly id: string; readonly text: string }[];
  readonly body: (deployment: Deployment) => ReactNode;
}

const EXPLORER = "https://sepolia.etherscan.io";

function H2({ id, children }: { readonly id: string; readonly children: ReactNode }) {
  return (
    <h2 id={id} className="mt-14 mb-1 scroll-mt-24 font-display text-[32px] leading-tight tracking-wide text-sun first:mt-0">
      {children}
    </h2>
  );
}

function P({ children }: { readonly children: ReactNode }) {
  return <p className="my-4 text-[17px] leading-[1.75] text-cream/85">{children}</p>;
}

function C({ children }: { readonly children: ReactNode }) {
  return <code className="rounded-md bg-black/40 px-1.5 py-0.5 font-mono text-[0.85em] text-sun">{children}</code>;
}

function Table({ head, rows }: { readonly head: readonly string[]; readonly rows: readonly (readonly ReactNode[])[] }) {
  return (
    <div className="my-5 overflow-x-auto rounded-2xl border border-cream/15" tabIndex={0} role="region" aria-label="Table, scroll sideways on small screens">
      <table className={cn("w-full border-collapse text-left text-sm", head.length > 2 && "min-w-[520px]")}>
        {head.some(Boolean) && (
          <thead className="bg-black/30 text-xs tracking-[.08em] text-muted uppercase">
            <tr>
              {head.map((h, i) => (
                <th key={i} scope="col" className="px-4 py-3 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-cream/10 align-top first:border-t-0">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 text-cream/90">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Address({ value }: { readonly value: string }) {
  return (
    <a href={`${EXPLORER}/address/${value}`} target="_blank" rel="noopener noreferrer" className="break-all font-mono text-sun underline underline-offset-4">
      {value}
    </a>
  );
}

const ACTION_TYPE = `Action(
  uint256 table,
  uint8 seat,
  uint8 kind,      // 0 play, 1 draw, 2 pass, 3 take, 4 mono,
                   // 5 accept, 6 challenge, 7 catch, 8 veil, 9 doubt
  uint8 slot,
  uint8 card,      // played card, or the named card of a veil
  uint8 color,     // wild colour, or seat * 32 + slot for a spyglass
  bytes32 seenHandle,
  uint32 nonce
)`;

const READ_TABLE = `import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { kryphoTableAbi } from "@kryphochroma/abi";

const client = createPublicClient({ chain: sepolia, transport: http() });
const table = await client.readContract({
  address: TABLE_ADDRESS,
  abi: kryphoTableAbi,
  functionName: "getTable",
  args: [1n],
});
console.log(table.stage, table.turn, table.topCard, table.color);`;

const DECRYPT_HAND = `import { ZamaSDK } from "@zama-fhe/sdk";
import { sepolia as zamaSepolia } from "@zama-fhe/sdk/chains";
import { createConfig } from "@zama-fhe/sdk/viem";
import { web } from "@zama-fhe/sdk/web";

const sdk = new ZamaSDK(createConfig({
  chains: [zamaSepolia],
  publicClient,
  walletClient,          // your session key, no wallet popup
  relayers: { [zamaSepolia.id]: web() },
}));

await sdk.permits.grantPermit([TABLE_ADDRESS]);
const handles = await publicClient.readContract({
  address: TABLE_ADDRESS, abi: kryphoTableAbi,
  functionName: "handOf", args: [tableId, mySeat],
});
const cards = await sdk.decryption.decryptValues(
  handles.map((encryptedValue) => ({ encryptedValue, contractAddress: TABLE_ADDRESS })),
);`;

const SIGN_MOVE = `import { ACTION_TYPES, actionDomain, fieldsFor } from "@kryphochroma/abi";

const fields = fieldsFor(tableId, mySeat, { type: "veil", slot: 3, claim: 0x47 }, nonce, handles);
const signature = await sessionKey.signTypedData({
  domain: actionDomain(11155111, TABLE_ADDRESS),
  types: ACTION_TYPES,
  primaryType: "Action",
  message: fields,
});
await fetch("/api/act", {
  method: "POST",
  body: JSON.stringify({ ...fields, table: fields.table.toString(), signature }),
});`;

const DRAW = `index  = FHE.shr(FHE.mul(FHE.asEuint32(FHE.randEuint16()), 138), 16)  // 0..137
color  = FHE.div(index, 26)
offset = index - color * 26
card   = index >= 130 ? 0x5D + (offset & 1)              // FHE.select
                      : (color << 4) + ((offset + 1) >> 1)
FHE.allowThis(card)                                       // one stored ciphertext per card`;

export const DOCS: readonly DocPage[] = [
  {
    slug: "overview",
    group: "Getting started",
    title: "Overview",
    summary: "A five colour shedding card game where hidden information is the game, running on Zama FHEVM.",
    headings: [
      { id: "what", text: "What it is" },
      { id: "why-fhe", text: "Why it needs FHE" },
      { id: "at-a-glance", text: "At a glance" },
    ],
    body: () => (
      <>
        <H2 id="what">What it is</H2>
        <P>
          Kryphochroma (from the Greek for hidden colour) is a shedding card game for 2 to 4 players. Match the top card by colour or number, empty your hand first, and use four mechanics that only work because every card is encrypted: a veiled bluff, a spyglass that reads one rival card, a sonar that counts a colour inside a rival hand, and a secret colour that doubles your round.
        </P>
        <P>Hands, the deck, veiled cards and secret colours live on Sepolia as Zama FHE ciphertexts. The contract draws, deals and checks every move without seeing a card. Each player decrypts only their own cards with a session key in the browser tab.</P>
        <H2 id="why-fhe">Why it needs FHE</H2>
        <P>A card game on a public chain normally has two bad options: trust a server with the deck, or put the deck in public storage where anyone with an RPC can read every hand. FHE gives a third option: the contract computes on encrypted cards and reveals only what the rules say should be revealed, with a KMS proof.</P>
        <Callout title="One bit at a time">A doubted veil or a challenged Wild +4 reveals exactly one encrypted bit. The rest of the hand stays sealed.</Callout>
        <H2 id="at-a-glance">At a glance</H2>
        <Table
          head={["Topic", "Value"]}
          rows={[
            ["Players", "2 to 4, humans and bots in any mix"],
            ["Deck", "138 cards: 5 colours, spyglasses, wilds"],
            ["Network", "Sepolia, FHEVM v0.13"],
            ["Move latency", "Under a second to every client, batched on chain about once per block"],
            ["Wallet", "Optional. Guests get a session key and test ETH"],
          ]}
        />
      </>
    ),
  },
  {
    slug: "quick-start",
    group: "Getting started",
    title: "Quick start",
    summary: "Play in under a minute: as a guest, with a wallet, with friends or offline.",
    headings: [
      { id: "guest", text: "Play as a guest" },
      { id: "wallet", text: "Play with a wallet" },
      { id: "friends", text: "Play with friends" },
      { id: "offline", text: "Practice offline" },
    ],
    body: () => (
      <>
        <H2 id="guest">Play as a guest</H2>
        <P>
          Open <a href="/new" className="text-sun underline underline-offset-4">Play on Sepolia</a> and press <b>Quick game vs bots</b>. Your tab creates a session key and signs its seat, our relayer puts it on chain, and you sit down with three bots at a table whose cards were already drawn. Your hand opens about 15 s after the click.
        </P>
        <H2 id="wallet">Play with a wallet</H2>
        <P>Connect an injected wallet and switch to Sepolia. The wallet signs one <C>join</C> for the tab session key and sends it a little gas in the same transaction. After that the session key plays every move, so there are no more popups. It can never move your funds.</P>
        <H2 id="friends">Play with friends</H2>
        <P>Pick the number of players and press <b>With friends</b>. You land in the lobby with an invite link. Friends open it and press <b>Take a seat</b>. The host starts when everyone is in, or fills the empty seats with bots. Open tables are also listed on the play page, so anyone can join.</P>
        <Callout tone="ok" title="Watching">Every table has a spectator view at /t/&lt;id&gt;/watch with public state only.</Callout>
        <H2 id="offline">Practice offline</H2>
        <P>
          <a href="/play" className="text-sun underline underline-offset-4">Practice offline</a> runs the same rules engine against local bots, with no chain and no keys.
        </P>
      </>
    ),
  },
  {
    slug: "rules",
    group: "Game",
    title: "Rules",
    summary: "The deck, a turn, action cards, Mono, challenges, scoring and timeouts.",
    headings: [
      { id: "deck", text: "Deck" },
      { id: "turn", text: "A turn" },
      { id: "actions", text: "Action cards" },
      { id: "mono", text: "Mono!" },
      { id: "scoring", text: "Scoring" },
      { id: "timeouts", text: "Timeouts and leaving" },
    ],
    body: () => (
      <>
        <H2 id="deck">Deck</H2>
        <Table
          head={["Cards", "Per colour", "Total"]}
          rows={[
            ["0", "1", "5"],
            ["1 to 9", "2 each", "90"],
            ["Skip, Reverse, Draw Two", "2 each", "30"],
            ["Spyglass", "1", "5"],
            ["Wild, Wild +4", "", "4 + 4"],
          ]}
        />
        <P>Colours: red, sun, teal, blue and violet. A card is one byte: <C>colour * 16 + rank</C>, wilds use colour 5.</P>
        <H2 id="turn">A turn</H2>
        <P>Play a card that matches the top card by colour or number, or any wild. If you can not, draw one card; you may play it if it fits, otherwise pass. Instead of a normal play you may veil a card once per round.</P>
        <H2 id="actions">Action cards</H2>
        <Table
          head={["Card", "Effect"]}
          rows={[
            ["Skip", "The next player loses their turn"],
            ["Reverse", "Direction flips; with two players it acts as a skip"],
            ["Draw Two", "The next player draws two and is skipped (stacking is a table option)"],
            ["Spyglass", "You read one sealed card of a rival of your choice"],
            ["Wild", "Pick the next colour"],
            ["Wild +4", "Pick the colour; the next player takes four or challenges it"],
          ]}
        />
        <H2 id="mono">Mono!</H2>
        <P>When you are down to one card, press Mono! before the next player acts. If you forget, any other player can catch you and you draw two.</P>
        <H2 id="scoring">Scoring</H2>
        <P>The first player to empty their hand wins the round and scores the cards left in every other hand: numbers at face value, actions and spyglasses 20, wilds 50. If your last card matches your secret colour, the round counts double. A player caught lying about a card can not win and forfeits up to 100 points to the winner.</P>
        <H2 id="timeouts">Timeouts and leaving</H2>
        <P>Each turn has a timer. When it runs out, the keeper draws a card for the player and moves on. After three timeouts in a row a takeover bot plays the seat with its sealed hand.</P>
      </>
    ),
  },
  {
    slug: "mechanics",
    group: "Game",
    title: "Veil, Spyglass, Secret colour",
    summary: "The four mechanics that only exist because cards stay encrypted.",
    headings: [
      { id: "veil", text: "Veil" },
      { id: "spyglass", text: "Spyglass" },
      { id: "sonar", text: "Sonar" },
      { id: "secret", text: "Secret colour" },
    ],
    body: () => (
      <>
        <H2 id="veil">Veil</H2>
        <P>Once per round, with two or more cards in hand, you can lay any card face down and name a number card that fits the pile. The pile shows the named card. The real card stays an encrypted handle, and the contract stores one encrypted bit: <C>FHE.eq(real card, named card)</C>.</P>
        <P>The next player may press <b>Doubt</b> as their first action. Only then is the bit made publicly decryptable and settled with a KMS proof. A lie makes the veiler draw four; a true veil makes the doubter draw two. Any other first action accepts the veil and the bit is never revealed.</P>
        <Callout title="Why it needs FHE">On an open chain everyone could check the face down card at once, so a veil would be a plain lie. With FHE the only thing that can ever leak is one bit, and only when someone pays for the doubt.</Callout>
        <H2 id="spyglass">Spyglass</H2>
        <P>
          A coloured action card. When you play it you pick one opponent and one slot of their hand. The contract calls <C>FHE.allow(hand[target][slot], your session key)</C>: from then on your key can decrypt that one card. Everyone sees which slot you looked at; nobody else sees the card.
        </P>
        <H2 id="sonar">Sonar</H2>
        <P>
          Once per round, instead of your move, you ping one rival for one colour. The contract already keeps the colour of every card as its own encrypted handle, so it counts without decrypting anything: for each occupied slot it adds <C>FHE.select(FHE.eq(colour[slot], asked), 1, 0)</C>, then calls <C>FHE.allow(count, your session key)</C>. The table sees who pinged whom and for which colour. Only you learn the number.
        </P>
        <Callout title="Why it needs FHE">A server could answer the same question, but then you trust the server not to lie and not to read the hands. Here the answer is computed by the contract from the very ciphertexts that will be revealed at the end of the round, so it can be neither faked nor leaked.</Callout>
        <H2 id="secret">Secret colour</H2>
        <P>
          At the deal every seat gets <C>FHE.rem(FHE.randEuint8(), 5)</C>, allowed only to its owner. Go out on a card of that colour (wilds do not count) and your round score doubles. All secret colours are revealed with the hands at the end of the round. The value 0 is very slightly more likely (52 in 256 versus 51) because 256 is not a multiple of 5.
        </P>
      </>
    ),
  },
  {
    slug: "privacy",
    group: "Protocol",
    title: "Privacy model",
    summary: "What is encrypted, who can read it, when it is revealed and what still shows.",
    headings: [
      { id: "matrix", text: "Confidentiality matrix" },
      { id: "leaks", text: "What still shows" },
      { id: "trust", text: "Trust assumptions" },
    ],
    body: () => (
      <>
        <H2 id="matrix">Confidentiality matrix</H2>
        <Table
          head={["Data", "Type", "Who can read it", "Revealed"]}
          rows={[
            ["Cards in a hand", <C key="a">euint8</C>, "Owner only", "Played cards as part of the move; the rest at round end"],
            ["Deck order", <C key="b">euint8[138]</C>, "Nobody", "Never, only drawn cards to their drawer"],
            ["Veiled card", <C key="c">euint8 + ebool</C>, "Nobody", "One bit, only if doubted"],
            ["Spyglass target", <C key="d">FHE.allow</C>, "The spyglass player", "Never to the rest of the table"],
            ["Secret colour", <C key="e">euint8</C>, "Owner only", "Round end"],
            ["Wild +4 colour bit", <C key="f">ebool</C>, "Nobody", "One bit, only if challenged"],
            ["Honesty of moves", <C key="g">ebool</C>, "Nobody", "Round end"],
          ]}
        />
        <H2 id="leaks">What still shows</H2>
        <P>Hand slots are numbered, so you can tell that a played card is the one drawn a few turns ago. Everyone sees which slot a spyglass looked at. Drawing and playing at once is visible. Transaction timing can hint that a player was thinking.</P>
        <H2 id="trust">Trust assumptions</H2>
        <P>The relay hub can delay moves but can not forge them: every action is signed by the session key and checked on chain. The takeover key sees the hand of an abandoned seat because it has to play it. A signed move has no expiry beyond its nonce; the hub submits within seconds.</P>
      </>
    ),
  },
  {
    slug: "architecture",
    group: "Protocol",
    title: "Architecture",
    summary: "Browser session keys, the relay hub, the keeper lanes and the contract.",
    headings: [
      { id: "flow", text: "How a move travels" },
      { id: "keeper", text: "Keeper and shuffler" },
      { id: "reveal", text: "Reveals" },
    ],
    body: () => (
      <>
        <H2 id="flow">How a move travels</H2>
        <Code title="flow">{`browser tab (session key)
  └─ EIP-712 signed action ──> relay hub ── checks rules, streams to every client (SSE)
                                   └─ relay(id, actions[]) about once per block ──> KryphoTable
KryphoTable <── FHE ops, ACL ──> Zama coprocessor
browser <── user decrypt of own cards ── Zama relayer and KMS`}</Code>
        <P>Clients render the projected state at once and the chain stays the source of truth. Each action carries its seat nonce and the handle of the slot it plays, so a stale or replayed action is refused on chain.</P>
        <H2 id="keeper">Keeper and shuffler</H2>
        <P>Two keys drive the table. The keeper does the urgent work on every table first: dealing, revealing the first card, settling challenges and veils, reveals at round end and timeouts. The shuffler draws cards in the background: twelve transactions of encrypted draws for each ready table, and fresh cards for a running deck that runs low.</P>
        <H2 id="reveal">Reveals</H2>
        <P>Every reveal uses a handle the contract stored, <C>FHE.makePubliclyDecryptable</C>, a KMS proof checked with <C>FHE.checkSignatures</C>, and a forward stage change. A caller never supplies the handle, and a proof can not be replayed.</P>
      </>
    ),
  },
  {
    slug: "randomness",
    group: "Protocol",
    title: "Encrypted draws",
    summary: "How every card is drawn on chain, why there is no shuffle, and how close the odds are to a real deck.",
    headings: [
      { id: "draw", text: "One draw per card" },
      { id: "why", text: "Why not a shuffle" },
      { id: "quality", text: "Odds" },
      { id: "refill", text: "Background refill" },
    ],
    body: () => (
      <>
        <H2 id="draw">One draw per card</H2>
        <P>Every card is its own encrypted random draw with the odds of a full 138 card deck: a 16 bit random number is scaled to an index from 0 to 137, and the index is turned into a card with the same layout as a real deck, all on ciphertexts. A table draws its 138 cards in twelve transactions of twelve cards.</P>
        <Code title="KryphoDeck.randomCard">{DRAW}</Code>
        <H2 id="why">Why not a shuffle</H2>
        <P>The first version shuffled a plaintext deck through 32 layers of encrypted switches, 70 transactions per table, and stored every intermediate ciphertext on the shared Zama coprocessor. Drawing each card on its own stores one ciphertext per card and needs no switch network: about 30 times fewer stored values and 9 times less gas per table, with no change to the game.</P>
        <H2 id="quality">Odds</H2>
        <P>Scaling a 16 bit draw to 138 keeps every card within 0.2 percent of its share of a real deck. Cards are independent, so a table can hold more copies of a card than a paper deck would, and nobody can count cards to predict the next one. The first discard is revealed one card at a time from the far end, so no card that stays in play becomes public.</P>
        <H2 id="refill">Background refill</H2>
        <P>When a running deck has 48 cards or fewer left, the shuffler draws up to 60 fresh cards into a free part of the deck while play goes on, and the deck switches over when it runs out. Played cards never come back.</P>
      </>
    ),
  },
  {
    slug: "contracts",
    group: "Developers",
    title: "Contracts",
    summary: "Addresses on Sepolia, entry points and events.",
    headings: [
      { id: "addresses", text: "Addresses" },
      { id: "functions", text: "Entry points" },
      { id: "events", text: "Events" },
    ],
    body: (d) => (
      <>
        <H2 id="addresses">Addresses</H2>
        <Table
          head={["Contract", "Address"]}
          rows={[
            ["KryphoTable", <Address key="t" value={d.table} />],
            ["KryphoDeck (library)", <Address key="d" value={d.deck} />],
            ["KryphoScore (library)", <Address key="s" value={d.score} />],
            ["KryphoRadio (library)", <Address key="r" value={d.radio} />],
            ["KryphoLobby (library)", <Address key="l" value={d.lobby} />],
            ["Takeover key", <Address key="k" value={d.takeover} />],
          ]}
        />
        <P>Deployed at block {d.block}. Solidity 0.8.27, <C>@fhevm/solidity</C> 0.13.4, <C>ZamaEthereumConfig</C>.</P>
        <H2 id="functions">Entry points</H2>
        <Table
          head={["Function", "Who", "What"]}
          rows={[
            [<C key="1">createTable(config)</C>, "anyone", "Open a table for 2 to 4 seats"],
            [<C key="2">join(id, session)</C>, "player", "Take a seat for a session key, forwards any ETH sent to it"],
            [<C key="3">start(id)</C>, "host", "Start drawing the cards, or deal at once if the table already has them"],
            [<C key="4">play(id, slot, card, color, seenHandle)</C>, "seat on turn", "Play a card; color carries the wild colour or the spyglass target"],
            [<C key="5">veil(id, slot, claim, seenHandle)</C>, "seat on turn", "Lay a card face down as a named number card"],
            [<C key="6">doubtVeil(id)</C>, "next seat", "Doubt the veil; the keeper settles it with a proof"],
            [<C key="7">relay(id, actions[])</C>, "anyone", "Submit a batch of signed actions"],
            [<C key="8">handOf / secretOf</C>, "view", "Encrypted handles of a hand and a secret colour"],
          ]}
        />
        <H2 id="events">Events</H2>
        <P>
          <C>Played</C>, <C>Drew</C>, <C>Veiled</C>, <C>VeilDoubted</C>, <C>VeilResolved</C>, <C>Peeked</C>, <C>ChallengeResolved</C>, <C>RoundSettled</C> and more. Encrypted values never appear in events.
        </P>
      </>
    ),
  },
  {
    slug: "integrate",
    group: "Developers",
    title: "Integrate",
    summary: "Read a table, decrypt your hand and sign a move from your own code.",
    headings: [
      { id: "read", text: "Read a table" },
      { id: "decrypt", text: "Decrypt your hand" },
      { id: "sign", text: "Sign a move" },
    ],
    body: () => (
      <>
        <H2 id="read">Read a table</H2>
        <Code title="read.ts">{READ_TABLE}</Code>
        <H2 id="decrypt">Decrypt your hand</H2>
        <P>The session key that joined the seat holds the ACL for its cards. Grant a permit once, then decrypt the handles.</P>
        <Code title="decrypt.ts">{DECRYPT_HAND}</Code>
        <H2 id="sign">Sign a move</H2>
        <P>Moves are EIP-712 typed data. The hub checks them against the rules engine and relays them in batches.</P>
        <Code title="Action">{ACTION_TYPE}</Code>
        <Code title="sign.ts">{SIGN_MOVE}</Code>
      </>
    ),
  },
  {
    slug: "security",
    group: "Developers",
    title: "Security",
    summary: "Audits before launch and the risks we accept.",
    headings: [
      { id: "reviews", text: "Reviews" },
      { id: "fixed", text: "Fixed before launch" },
      { id: "accepted", text: "Accepted risks" },
    ],
    body: () => (
      <>
        <H2 id="reviews">Reviews</H2>
        <P>The contracts had two independent security passes and the services and web app one, before going public. Every high finding is fixed and has a test that fails without the fix.</P>
        <H2 id="fixed">Fixed before launch</H2>
        <Table
          head={["Finding", "Fix"]}
          rows={[
            ["Revealing three starter candidates made draw cards public", "Reveal one card at a time"],
            ["A relayed action starved of gas burned the nonce", "An out of gas failure reverts the whole batch"],
            ["Faucet race and spoofable client IP", "Atomic faucet ledger, client IP trusted only from Cloudflare"],
            ["Anyone could seat bots at any table", "Bot requests need a signature from a seated player"],
          ]}
        />
        <H2 id="accepted">Accepted risks</H2>
        <P>A signed move has no expiry beyond its nonce. The takeover key sees abandoned hands. The switch network over a deck that is not a power of two is close to, not exactly, uniform.</P>
      </>
    ),
  },
  {
    slug: "faq",
    group: "Developers",
    title: "FAQ",
    summary: "Short answers to common questions.",
    headings: [
      { id: "slow", text: "Why does my hand take a minute?" },
      { id: "cheat", text: "Can someone cheat by naming a card they do not hold?" },
      { id: "wallet", text: "Do I need a wallet?" },
    ],
    body: () => (
      <>
        <H2 id="slow">How long until my first move?</H2>
        <P>The server draws the cards of a few tables ahead of time and reveals their first discard while they wait in the lobby. The join that fills the last seat deals every hand and opens play in one Sepolia block. Your browser then decrypts your hand in a few seconds. After that, moves reach every player in under a second.</P>
        <H2 id="cheat">Can someone cheat by naming a card they do not hold?</H2>
        <P>They can try. Every play updates an encrypted honesty bit, and all bits are revealed at the end of the round. A liar can not win and forfeits points. The veil is the only legal bluff, and it can be doubted.</P>
        <H2 id="wallet">Do I need a wallet?</H2>
        <P>No. Guests get a session key and test ETH from the faucet. A wallet only signs the join for your session key.</P>
      </>
    ),
  },
];

export function docBySlug(slug: string): DocPage | undefined {
  return DOCS.find((d) => d.slug === slug);
}
