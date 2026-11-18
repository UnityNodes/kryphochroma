import type { Viewport } from "next";
import { Close, Footer } from "@/components/landing/LandingClose";
import { Ledger, Ways } from "@/components/landing/LandingLedger";
import { LandingRoot } from "@/components/landing/LandingRoot";
import { LandingHeader, LandingStage } from "@/components/landing/LandingStage";
import { Deck, Game, Hero, Hidden, Moves } from "@/components/landing/LandingStory";
import { ROOM_INK } from "@/components/landing/constants";
import "./landing.css";

export const viewport: Viewport = { themeColor: ROOM_INK };

export default function Home() {
  return (
    <LandingRoot>
      <LandingStage />
      <LandingHeader />
      <main>
        <Hero />
        <Game />
        <Hidden />
        <Moves />
        <Deck />
        <div className="br-solid">
          <Ledger />
          <Ways />
        </div>
        <Close />
      </main>
      <Footer />
    </LandingRoot>
  );
}
