import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BACK_FACE, SPYGLASS_SHOT, VEIL_SHOT, cardUrl } from "./constants";
import { HeroView } from "./HeroView";

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
              A card game where every card is encrypted on chain. Not even the contract that deals them can look at your hand.
            </p>
            <PlayCtas />
            <HeroView />
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
            <span>How a</span> <span>round goes</span>
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
            Everyone starts with seven cards. On your turn you play one that matches the top card by colour or number, and if nothing fits you draw. Skip, Reverse, Draw Two and wilds do what you expect. Down to your last card you call Mono!, or you can be caught and draw two. A Wild +4 can be challenged: the contract answers yes or no without showing a hand. Whoever empties their hand first scores what the others still hold.
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
          Because every card is encrypted
        </p>
        <h2 className="br-hidden__h" data-rv>
          <span>Four moves</span> <span>for sealed</span> <span>cards</span>
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
    what: "Once a round you can put any card face down and say it is a number card that fits the pile. The next player either takes your word or doubts it.",
    stake: "A lie costs you 4 cards. A wrong doubt costs them 2.",
    chain: "The real card stays encrypted on chain. A doubt opens a single bit: was the claim true.",
  },
  {
    shot: SPYGLASS_SHOT,
    slug: "spy",
    side: "r",
    still: "blue-spyglass",
    name: "Spyglass",
    what: "An action card. When you play it you pick one sealed card in another player's hand and look at it.",
    stake: "The table sees which card you picked, not what it is.",
    chain: (
      <>
        <code>FHE.allow(card, yourSessionKey)</code> gives your session key access to that one card.
      </>
    ),
  },
  {
    shot: 5,
    slug: "sonar",
    side: "l",
    still: BACK_FACE,
    name: "Sonar",
    what: "Once a round, instead of playing, you can ask how many cards of one colour another player holds.",
    stake: "The others see that you asked, but not the answer.",
    chain: "The contract counts inside the encrypted hand and no card is turned over.",
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
    what: "At the deal you get a colour that only you know. If your last card is that colour, the round counts double.",
    stake: "The others cannot tell which colour to keep from you.",
    chain: "It is shown with the hands when the round ends.",
  },
];

export function Moves() {
  return MOVES.map((move, index) => <Move key={move.slug} order={index + 1} total={MOVES.length} {...move} />);
}

const STEPS: readonly Omit<StepProps, "order">[] = [
  {
    title: "Drawn by the contract",
    text: "There is no shuffled deck sitting anywhere. Each card is an encrypted random draw made by the contract, with the same odds as a 138 card deck, and it stays unread until its owner decrypts it. The server cannot read it either.",
    note: "A table draws its cards in the background, in about 30 seconds, before anyone sits down.",
  },
  {
    title: "Dealt to one key",
    text: "Every card is granted to the session key of the player who gets it. Your browser tab decrypts your hand through the Zama relayer, so there is no wallet popup.",
    note: (
      <>
        <code>FHE.allow(handle, sessionKey)</code> Your next two draws are granted in advance, which is why a drawn card opens right away.
      </>
    ),
  },
  {
    title: "Opened only when the rules say so",
    text: "The first discard, a doubted veil and the hands at the end of a round are the only things that open. Each comes with a proof from the Zama KMS.",
    note: (
      <>
        <code>FHE.checkSignatures</code> The contract verifies that proof before it accepts the value.
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
