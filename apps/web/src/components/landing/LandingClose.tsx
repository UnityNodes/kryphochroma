import Link from "next/link";
import { ASSET_BASE } from "./constants";
import { PlayCtas } from "./LandingStory";

export function Close() {
  return (
    <section className="br-close" data-close>
      <div className="br-close__in">
        <h2 className="br-close__h" data-rv>
          <span className="br-close__a">Sit down.</span>{" "}
          <span className="br-close__b">
            <span>The cards are</span> <span>already drawn.</span>
          </span>
        </h2>
        <PlayCtas closing />
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="br-foot">
      <div className="br-foot__in">
        <div className="br-foot__lead">
          <img src={`${ASSET_BASE}/logo.svg`} alt="" width={40} height={40} />
          <p>A card game in the Crazy Eights family, with hands encrypted by Zama FHE.</p>
        </div>
        <ul className="br-foot__links">
          <li>
            <Link href="/docs">Docs</Link>
          </li>
          <li>
            <Link href="/secret">How it stays secret</Link>
          </li>
          <li>
            <Link href="/play">Practice</Link>
          </li>
        </ul>
      </div>
    </footer>
  );
}
