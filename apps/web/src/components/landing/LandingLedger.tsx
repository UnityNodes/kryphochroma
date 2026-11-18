import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { ASSET_BASE } from "./constants";

const LEAKED_WHO = "Anyone";
const LEAKED_WHEN = "As soon as it is on chain";

const LEDGER = [
  { what: "Cards in a hand", who: "Owner only", when: "Played cards open with the move, the rest at round end" },
  { what: "Deck order", who: "Nobody", when: "Never. Not to the contract, not to the operators" },
  { what: "Veiled card", who: "Nobody", when: "One bit, and only if doubted" },
  { what: "Spyglass target", who: "The spyglass player", when: "Never to the rest of the table" },
  { what: "Sonar answer", who: "The player who pinged", when: "The table sees the ping, not the number" },
  { what: "Secret colour", who: "Owner only", when: "At round end, with the hands" },
  { what: "Had the colour at a Wild +4", who: "Nobody", when: "One bit, and only if challenged" },
  { what: "Honesty of every move", who: "Nobody", when: "Once, at round end" },
] as const;

const WAYS = [
  { title: "Quick game", text: "You and three bots at a table whose cards were drawn before you clicked. No wallet and no test ETH.", href: "/new", action: "Take a seat" },
  {
    title: "With friends",
    text: (
      <>
        Open a table for 2 to 4 and share a link like <code>/j/teal-otter</code>. Play opens the moment the last seat is taken.
      </>
    ),
    href: "/new",
    action: "Open a table",
  },
  { title: "Practice offline", text: "The same rules against bots in your browser. Nothing goes on chain.", href: "/play", action: "Start practice" },
] as const;

export function Ledger() {
  return (
    <section className="br-ledger" id="secret">
      <div className="br-ledger__in">
        <h2 className="br-ledger__h" data-rv>
          <span>What stays</span> <span>secret</span>
        </h2>
        <div className="br-ledger__bar" data-rv>
          <p>A ledger of who can read what. Flip it to see the same table on a contract with open state.</p>
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
            See the same table as an open contract would leak it
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
          <figcaption>The real table. This round is practice against local bots.</figcaption>
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
          <p>Eleven free internet stations, from old time jazz to lo-fi and synthwave. Nothing plays until you press play.</p>
        </div>
      </div>
    </section>
  );
}
