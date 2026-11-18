import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { ASSET_BASE } from "./constants";

const LEAKED_WHO = "Anyone";
const LEAKED_WHEN = "As soon as it is on chain";

const LEDGER = [
  { what: "Cards in a hand", who: "Owner only", when: "Played cards open with the move, the rest at round end" },
  { what: "Deck order", who: "Nobody", when: "Never, not even to the contract or to us" },
  { what: "Veiled card", who: "Nobody", when: "Only one bit, and only if someone doubts" },
  { what: "Spyglass target", who: "The spyglass player", when: "Never to the rest of the table" },
  { what: "Sonar answer", who: "The player who pinged", when: "The others only see that you asked" },
  { what: "Secret colour", who: "Owner only", when: "At round end, with the hands" },
  { what: "Had the colour at a Wild +4", who: "Nobody", when: "Only one bit, and only on a challenge" },
  { what: "Honesty of every move", who: "Nobody", when: "At round end" },
] as const;

const WAYS = [
  { title: "Quick game", text: "You sit down with three bots at a table whose cards were drawn before you clicked. You need no wallet and no test ETH.", href: "/new", action: "Take a seat" },
  {
    title: "With friends",
    text: (
      <>
        Open a table for two to four players and send them a link like <code>/j/teal-otter</code>. The game starts as soon as the last seat is taken.
      </>
    ),
    href: "/new",
    action: "Open a table",
  },
  { title: "Practice offline", text: "The same rules against bots, entirely in your browser. Nothing is sent to the chain.", href: "/play", action: "Start practice" },
] as const;

export function Ledger() {
  return (
    <section className="br-ledger" id="secret">
      <div className="br-ledger__in">
        <h2 className="br-ledger__h" data-rv>
          <span>What stays</span> <span>secret</span>
        </h2>
        <div className="br-ledger__bar" data-rv>
          <p>Who can read what during a game. Use the switch to see the same table on an ordinary contract, where all state is public.</p>
          <button type="button" className="br-switch" role="switch" aria-checked="false" aria-label="Show what an open contract would leak">
            <span className="br-switch__o br-switch__o--a">Sealed</span>
            <span className="br-switch__o br-switch__o--b">Open contract</span>
          </button>
        </div>

        <table className="br-led" data-rv>
          <thead>
            <tr>
              <th scope="col">On the table</th>
              <th scope="col">Who can read it</th>
              <th scope="col">When it opens</th>
            </tr>
          </thead>
          <tbody>
            {LEDGER.map(({ what, who, when }) => (
              <tr key={what}>
                <th scope="row">{what}</th>
                <td className="br-led__who" data-l="Who" data-sealed={who} data-leaked={LEAKED_WHO}>
                  {who}
                </td>
                <td className="br-led__when" data-l="Opens" data-sealed={when} data-leaked={LEAKED_WHEN}>
                  {when}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="br-ledger__foot" data-rv>
          <p className="br-ledger__pub">
            <strong>Public for everyone:</strong> whose turn it is, how many cards each seat holds, the discard pile, and that a veil, peek or ping happened.
          </p>
          <Link className="br-link" href="/secret">
            See what an open contract would leak
            <ArrowUpRight aria-hidden="true" size={18} strokeWidth={1.5} />
          </Link>
        </div>
      </div>
    </section>
  );
}

export function Ways() {
  return (
    <section className="br-ways">
      <div className="br-ways__in">
        <figure className="br-shot" data-rv>
          <img
            src={`${ASSET_BASE}/table-desktop.webp`}
            alt="The Kryphochroma table in a practice round: three sealed rival hands, the sealed deck, the discard pile and your own open hand."
            width={2880}
            height={1800}
            loading="lazy"
          />
          <figcaption>The table itself, here in a practice round against bots.</figcaption>
        </figure>
        <div className="br-ways__col">
          <h2 className="br-ways__h" data-rv>
            <span>Three ways</span> <span>to play</span>
          </h2>
          {WAYS.map(({ title, text, href, action }) => (
            <article className="br-way" data-rv key={title}>
              <h3>{title}</h3>
              <p>{text}</p>
              <Link className="br-link" href={href}>
                {action}
              </Link>
            </article>
          ))}
        </div>
        <div className="br-fm" data-rv>
          <h3>Radio at the table</h3>
          <p>Eleven free internet stations, from old time jazz to lo-fi and synthwave. It stays silent until you press play.</p>
        </div>
      </div>
    </section>
  );
}
