import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BACK_FACE, SPYGLASS_SHOT, VEIL_SHOT, cardUrl } from "./constants";

const FALLBACK_ROW = ["sun-4", "red-7", "teal-9", BACK_FACE, BACK_FACE, BACK_FACE] as const;
const COLOURS = ["Red", "Sun", "Teal", "Blue", "Violet"] as const;

interface MoveCopy {
  readonly shot: number;
  readonly slug: string;
  readonly side: "l" | "r";
  readonly still: string;
  readonly name: ReactNode;
  readonly what: string;
  readonly stake: string;
  readonly chain: ReactNode;
}

interface MoveProps extends MoveCopy {
  readonly order: number;
  readonly total: number;
}

interface StepProps {
  readonly order: number;
  readonly title: string;
  readonly text: string;
  readonly note: ReactNode;
}

export function PlayCtas({ closing = false }: { readonly closing?: boolean }) {
  return (
    <div className={closing ? "br-cta br-cta--mid" : "br-cta"} data-in={closing ? undefined : true} data-rv={closing ? true : undefined}>
      <Link className="br-btn br-btn--brass" href="/new">
        Play on Sepolia
        <ArrowUpRight aria-hidden="true" size={18} strokeWidth={1.5} />
      </Link>
      <Link className="br-btn br-btn--line" href="/play">
        Practice offline
      </Link>
    </div>
  );
}

function CardStill({ name, className }: { readonly name: string; readonly className?: string }) {
  return <img className={className} src={cardUrl(name)} alt="" width={480} height={720} loading="lazy" aria-hidden="true" />;
}

export function Hero() {
  return (
    <section className="br-hero" id="top" data-shot="0">
      <div className="br-hero__in">
        <div className="br-hero__mark">
          <h1 className="br-hero__title" data-in>
            The card game nobody can peek at.
          </h1>
        </div>

        <div className="br-fallback" aria-hidden="true">
          <div className="br-fallback__row">
            {FALLBACK_ROW.map((name, index) => (
              <CardStill key={index} name={name} />
            ))}
          </div>
        </div>

        <div className="br-hero__low">
          <div className="br-hero__copy">
            <p className="br-hero__lead" data-in>
              Hands, the deck and every bluff are FHE ciphertexts. The contract draws, deals and checks each move without seeing a card. Only you can decrypt yours.
            </p>
            <PlayCtas />
          </div>
        </div>
      </div>
    </section>
  );
}

export function Game() {
  return (
    <section className="br-game br-track" data-shot="1">
      <div className="br-pin">
        <div className="br-col br-col--r">
          <h2 className="br-game__h" data-rv>
            <span>The game</span> <span>in one breath</span>
          </h2>
          <p className="br-game__count" data-rv>
            <span className="br-game__num">138</span>
            <span className="br-game__of">cards in five colours</span>
          </p>
          <ul className="br-chips" data-rv aria-label="The five colours">
            {COLOURS.map((colour) => (
              <li key={colour}>
                <i className={`br-chip br-chip--${colour.toLowerCase()}`} />
                {colour}
              </li>
            ))}
          </ul>
          <p className="br-game__run" data-rv>
            Seven cards each. Match the top card by colour or number, empty your hand first, score what is left in the other hands. Skip, Reverse, Draw Two and wilds work as you would expect. No card to play: draw one. Down to one card: call Mono! or get caught and draw 2. A Wild +4 can be challenged, and one encrypted bit settles it.
          </p>
        </div>
      </div>
    </section>
  );
}

export function Hidden() {
  return (
    <section className="br-hidden" id="moves" data-shot="2">
      <div className="br-hidden__in">
        <p className="br-eyebrow" data-rv>
          Four moves that only work encrypted
        </p>
        <h2 className="br-hidden__h" data-rv>
          <span>Hidden</span> <span>information</span> <span>is the game.</span>
        </h2>
      </div>
    </section>
  );
}

function Move({ shot, slug, side, still, name, what, stake, chain, order, total }: MoveProps) {
  const column = (
    <div className={`br-col br-col--${side}`}>
      <p className="br-move__no" data-rv>
        {order} of {total}
      </p>
      <h3 className="br-move__name" data-rv>
        {name}
      </h3>
      <p className="br-move__what" data-rv>
        {what}
      </p>
      <p className="br-move__stake" data-rv>
        {stake}
      </p>
      <p className="br-move__chain" data-rv>
        {chain}
      </p>
    </div>
  );
  const picture = <CardStill name={still} className={`br-move__still br-move__still--${side === "l" ? "r" : "l"}`} />;
  return (
    <section className={`br-move br-move--${slug} br-track`} data-shot={shot}>
      <div className="br-pin">
        {side === "l" ? column : picture}
        {side === "l" ? picture : column}
      </div>
    </section>
  );
}

const MOVES: readonly MoveCopy[] = [
  {
    shot: VEIL_SHOT,
    slug: "veil",
    side: "l",
    still: BACK_FACE,
    name: "Veil",
    what: "Once per round, lay any card face down and name a number card that fits the pile. The next player believes you or doubts.",
    stake: "A lie draws 4. A wrong doubt draws 2.",
    chain: "On chain the real card stays encrypted. A doubt reveals one bit, true or false.",
  },
  {
    shot: SPYGLASS_SHOT,
    slug: "spy",
    side: "r",
    still: "blue-spyglass",
    name: "Spyglass",
    what: "A coloured action card. Play it and look at one sealed card in a rival hand.",
    stake: "Everyone sees which slot you looked at. Never the card.",
    chain: (
      <>
        <code>FHE.allow(card, yourSessionKey)</code> Your session key, and only yours, gets access to it.
      </>
    ),
  },
  {
    shot: 5,
    slug: "sonar",
    side: "l",
    still: BACK_FACE,
    name: "Sonar",
    what: "Once per round, instead of your move, ask how many cards of one colour a rival holds.",
    stake: "The table sees the ping. Only you see the number.",
    chain: "The contract counts inside the encrypted hand. No card turns.",
  },
  {
    shot: 6,
    slug: "colour",
    side: "r",
    still: "violet-3",
    name: (
      <>
        <span>Secret</span> <span>colour</span>
      </>
    ),
    what: "A colour dealt to you alone. Go out on a card of that colour and the round counts double.",
    stake: "Nobody can block a colour they can not see.",
    chain: "It is revealed with the hands at the end of the round.",
  },
];

export function Moves() {
  return MOVES.map((move, index) => <Move key={move.slug} order={index + 1} total={MOVES.length} {...move} />);
}

const STEPS: readonly Omit<StepProps, "order">[] = [
  {
    title: "Drawn by the contract",
    text: "Every card is an encrypted random draw with the odds of a full 138 card deck. Nothing is shuffled. Nobody sees a card before its owner decrypts it, not even the server.",
    note: "A table draws its 138 cards in the background, about 30 s, before anyone sits down.",
  },
  {
    title: "Dealt to one key",
    text: "Each card handle is granted to one session key. Your tab decrypts your hand through the Zama relayer, with no wallet popup.",
    note: (
      <>
        <code>FHE.allow(handle, sessionKey)</code> A drawn card opens at once because your next two draws are already granted to you.
      </>
    ),
  },
  {
    title: "Revealed only by the rules",
    text: "The first discard, a doubted veil and the hands at the end of a round each open with a KMS proof the contract checks.",
    note: (
      <>
        <code>FHE.checkSignatures</code> The contract checks the proof before anything opens.
      </>
    ),
  },
];

function Step({ order, title, text, note }: StepProps) {
  return (
    <li data-rv>
      <span className="br-steps__n" aria-hidden="true">
        {order}
      </span>
      <div className="br-steps__b">
        <h3>{title}</h3>
        <p>{text}</p>
        <p className="br-steps__note">{note}</p>
      </div>
    </li>
  );
}

export function Deck() {
  return (
    <section className="br-deck" id="deck" data-shot="7">
      <div className="br-deck__col">
        <h2 className="br-deck__h" data-rv>
          <span>A deck</span> <span>nobody holds</span>
        </h2>
        <ol className="br-steps">
          {STEPS.map((step, index) => (
            <Step key={step.title} order={index + 1} {...step} />
          ))}
        </ol>
      </div>
    </section>
  );
}
