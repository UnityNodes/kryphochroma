import Link from "next/link";
import { ASSET_BASE } from "./constants";

export function LandingStage() {
  return (
    <div className="br-stage" aria-hidden="true">
      <div className="br-scrim br-scrim--l" />
      <div className="br-scrim br-scrim--r" />
      <div className="br-tag br-tag--veil">
        <div className="br-tag__box">
          <span className="br-tag__k">You say</span>
          <span className="br-tag__v">Red 2</span>
          <span className="br-tag__s">The card itself stays sealed</span>
        </div>
      </div>
      <div className="br-tag br-tag--spy">
        <div className="br-tag__box">
          <span className="br-tag__v">Slot 5</span>
          <span className="br-tag__s">The table sees which slot, you see the card</span>
        </div>
      </div>
      <div className="br-tag br-tag--sonar">
        <div className="br-tag__box">
          <span className="br-tag__k">Teal in this hand</span>
          <span className="br-tag__v" data-count>
            0
          </span>
          <span className="br-tag__s">Shown to you alone</span>
        </div>
      </div>
    </div>
  );
}

export function LandingHeader() {
  return (
    <header className="br-head">
      <div className="br-head__in">
        <button type="button" className="br-brand" data-goto="top" aria-label="Kryphochroma, back to top">
          <img src={`${ASSET_BASE}/logo.svg`} alt="" width={30} height={30} />
          <span>Kryphochroma</span>
        </button>
        <button type="button" className="br-menu" aria-expanded="false" aria-controls="br-nav" aria-label="Menu">
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 7h16" />
            <path d="M4 12h16" />
            <path d="M4 17h16" />
          </svg>
        </button>
        <nav className="br-nav" id="br-nav" aria-label="Sections">
          <button type="button" data-goto="moves">
            Moves
          </button>
          <button type="button" data-goto="deck">
            The deck
          </button>
          <button type="button" data-goto="secret">
            What stays secret
          </button>
          <Link href="/docs">Docs</Link>
        </nav>
        <Link className="br-btn br-btn--brass br-btn--sm" href="/new">
          Play
        </Link>
      </div>
    </header>
  );
}
