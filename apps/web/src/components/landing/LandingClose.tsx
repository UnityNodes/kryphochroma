import Link from "next/link";
import { ASSET_BASE } from "./constants";
import { PlayCtas } from "./LandingStory";

const ETHERSCAN = "https://sepolia.etherscan.io/address";

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

export function Footer({ table }: { readonly table: string }) {
  return (
    <footer className="br-foot">
      <div className="br-foot__in">
        <div className="br-foot__lead">
          <img src={`${ASSET_BASE}/logo.svg`} alt="" width={40} height={40} />
          <p>A shedding card game in the Crazy Eights family, built on Zama FHEVM.</p>
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
        <p className="br-foot__contract">
          Contract{" "}
          <a href={`${ETHERSCAN}/${table}`} target="_blank" rel="noopener noreferrer">
            <code>{`${table.slice(0, 6)}…${table.slice(-4)}`}</code>
          </a>
        </p>
        <p className="br-foot__built">Built for the Zama Developer Program, Mainnet Season 5</p>
      </div>
    </footer>
  );
}
