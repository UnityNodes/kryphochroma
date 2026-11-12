"use client";

import { CARD_COLORS, sharedDefs } from "@kryphochroma/cards";
import { type Color, type Peek, canDraw, cardLabel, canSayMono, botCatchTarget, isPlayable, isSpyglass, isWild, legalMoves, veilClaims } from "@kryphochroma/rules";
import { Eye, EyeOff, House, Layers, Radar, Shapes, Shuffle, Swords, Trophy, Volume2, VolumeX, WifiOff } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { anchorKey } from "@/game/flight";
import type { TableController } from "@/game/controller";
import { SEAT_COLORS } from "@/game/offline";
import { SOUND_FOR_ICON } from "@/game/sound";
import { tableTension } from "@/game/radio";
import { useRadio } from "@/game/useRadio";
import { useSound } from "@/game/useSound";
import { useOfflineGame } from "@/game/useOfflineGame";
import { cn } from "@/lib/utils";
import { Center } from "./Center";
import { Feed } from "./Feed";
import { Hand } from "./Hand";
import { HowToPlay } from "./HowToPlay";
import { PeekDialog, PeekResult, SecretBadge, SecretChip, SonarDialog, SonarResult, VeilDialog } from "./Mechanics";
import { MonoBurst } from "./MonoBurst";
import { RadioChip } from "./RadioChip";
import { AvatarGlyph, avatarColor } from "@/components/profile/Avatar";
import { Seat } from "./Seat";

const POSITIONS: Record<number, readonly ("left" | "top" | "right")[]> = { 2: ["top"], 3: ["left", "right"], 4: ["left", "top", "right"] };

const ERROR_TEXT: Record<string, string> = {
  IllegalCard: "That card does not match the colour or the number",
  MustPlayDrawnCard: "You can only play the card you just drew",
  MustStackOrTake: "Stack a draw two or take the cards",
  CannotPass: "Draw a card before passing",
  VeilUsed: "You already veiled a card this round",
  NoVeil: "There is no veil to doubt",
  BadPeek: "Pick a card in an opponent's hand",
  BadSonar: "Sonar works once per round, on a rival, for one of the five colours",
};

export interface TableProps {
  readonly seats: number;
  readonly stackDrawTwo: boolean;
}

export function useColorBlind(): [boolean, (update: (v: boolean) => boolean) => void] {
  const [colorBlind, setColorBlind] = useState(false);
  useEffect(() => {
    if (window.matchMedia("(prefers-contrast: more)").matches) setColorBlind(true);
  }, []);
  return [colorBlind, setColorBlind];
}

export function Table({ seats, stackDrawTwo }: TableProps) {
  const [colorBlind, setColorBlind] = useColorBlind();
  const controller = useOfflineGame(seats, stackDrawTwo, colorBlind);
  return <TableView controller={controller} colorBlind={colorBlind} onToggleShapes={() => setColorBlind((v) => !v)} />;
}

export interface TableViewProps {
  readonly controller: TableController;
  readonly colorBlind: boolean;
  readonly onToggleShapes: () => void;
}

export function TableView({ controller: game, colorBlind, onToggleShapes }: TableViewProps) {
  const { state, busy, anchors, act, me, names } = game;
  const HUMAN = me;
  const pub = state.pub;
  const hand = state.hands[HUMAN] ?? [];
  const mine = pub.turn === HUMAN && !busy && pub.stage === "Playing";
  const moves = useMemo(() => legalMoves(pub, HUMAN, hand), [pub, hand]);
  const [pickingSlot, setPickingSlot] = useState<number | null>(null);
  const [peekSlot, setPeekSlot] = useState<number | null>(null);
  const [veiling, setVeiling] = useState(false);
  const [pinging, setPinging] = useState(false);
  const sound = useSound();
  const { play: playSound } = sound;
  const lastLine = game.feed[0];
  const [burst, setBurst] = useState<{ readonly actor: string | null; readonly stamp: number }>({ actor: null, stamp: 0 });
  useEffect(() => {
    const name = lastLine ? SOUND_FOR_ICON[lastLine.icon] : undefined;
    if (name) playSound(name);
    if (lastLine?.icon === "mono" && lastLine.actor) setBurst({ actor: lastLine.actor, stamp: Date.now() });
  }, [lastLine, playSound]);

  const anchorCache = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const anchor = useCallback(
    (key: string) => {
      const cached = anchorCache.current.get(key);
      if (cached) return cached;
      const callback = (el: HTMLElement | null) => {
        if (el) anchors.set(key, el);
        else anchors.delete(key);
      };
      anchorCache.current.set(key, callback);
      return callback;
    },
    [anchors],
  );

  const run = useCallback(
    (move: Parameters<typeof act>[0]) => {
      void act(move).then((error) => {
        if (error) toast.error(ERROR_TEXT[error] ?? error);
      });
    },
    [act],
  );

  const playable = useCallback((slot: number) => moves.some((m) => m.type === "play" && m.slot === slot), [moves]);

  const onPlay = useCallback(
    (slot: number) => {
      const card = hand[slot];
      if (card === null || card === undefined) return;
      if (isWild(card)) setPickingSlot(slot);
      else if (isSpyglass(card)) setPeekSlot(slot);
      else run({ type: "play", slot, card });
    },
    [hand, run],
  );

  const peekAt = (peek: Peek) => {
    const slot = peekSlot;
    const card = slot === null ? null : hand[slot];
    setPeekSlot(null);
    if (slot !== null && card !== null && card !== undefined) run({ type: "play", slot, card, peek });
  };

  const pick = (color: Color) => {
    const slot = pickingSlot;
    const card = slot === null ? null : hand[slot];
    setPickingSlot(null);
    if (slot !== null && card !== null && card !== undefined) run({ type: "play", slot, card, color });
  };

  const drawn = pub.drawnSlot !== null;
  const drawLabel = drawn || (mine && !canDraw(pub, HUMAN)) ? "Pass" : "Draw";
  const onDraw = () => run({ type: drawLabel === "Pass" ? "pass" : "draw" });
  const monoHot = canSayMono(pub, HUMAN) && hand.some((c) => c !== null && isPlayable(pub, c));
  const catchable = botCatchTarget(pub, HUMAN);
  const meSeat = pub.seats[HUMAN];
  const radio = useRadio(tableTension(pub, HUMAN));
  const canSonar = mine && !game.watching && !!meSeat && !meSeat.sonarUsed && pub.pendingDraw === 0 && pub.drawFour === null && pub.drawnSlot === null;
  const canVeil = mine && !!meSeat && !meSeat.veilUsed && meSeat.handSize >= 2 && pub.pendingDraw === 0 && pub.drawFour === null && veilClaims(pub).length > 0;
  const canDoubt = mine && pub.veil !== null && pub.veil.judge === HUMAN && pub.drawnSlot === null;
  const status = canDoubt && pub.veil ? `${names[pub.veil.by] ?? "Someone"} veiled a card as ${cardLabel(pub.veil.claim)}: doubt it or play on` : statusText(pub.stage, pub.turn, game.watching ? -1 : HUMAN, names, busy, drawn, pub.drawFour !== null, pub.pendingDraw);
  const seats = pub.config.seats;
  const opponents = POSITIONS[seats] ?? [];
  const result = pub.lastResult;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "d" || e.key === "D") onDraw();
      if (e.key === "m" || e.key === "M") run({ type: "mono" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="kc-app">
      <div aria-hidden dangerouslySetInnerHTML={{ __html: sharedDefs() }} />
      <header className="kc-top">
        <Link href="/" className="kc-brand" aria-label="Kryphochroma, back to the menu">
          <Logo />
          <div>
            <b>Kryphochroma</b>
            <small>FHE card game · nobody can peek</small>
          </div>
        </Link>
        <div className="kc-chips">
          {game.mode === "practice" ? (
            <span className="kc-chip kc-hide-s">
              <WifiOff aria-hidden />
              Practice · local bots
            </span>
          ) : (
            <span className="kc-chip kc-hide-s">
              <span className="kc-dot" />
              Sepolia · Zama FHE
            </span>
          )}
          {(game.chips ?? []).map((chip) => (
            <span key={chip} className="kc-chip kc-hide-s">
              {chip}
            </span>
          ))}
          <span className="kc-chip">
            <Trophy aria-hidden />
            Round {pub.round + 1}
          </span>
          <button type="button" className={cn("kc-chip", colorBlind && "kc-chip-on")} aria-pressed={colorBlind} aria-label="Colour-blind shapes" onClick={onToggleShapes}>
            <Shapes aria-hidden />
            <span className="kc-hide-s">Shapes</span>
          </button>
          <button type="button" className={cn("kc-chip", !sound.muted && "kc-chip-on")} aria-pressed={!sound.muted} aria-label={sound.muted ? "Sound off" : "Sound on"} onClick={sound.toggle}>
            {sound.muted ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
          </button>
          <RadioChip radio={radio} />
          <HowToPlay autoOpen={game.mode === "practice"} />
        </div>
      </header>
      <main className="kc-table">
        <MonoBurst actor={burst.actor} stamp={burst.stamp} />
        <div className="kc-rays" />
        <div className="kc-grain" />
        {opponents.map((position, i) => {
          const seat = (HUMAN + i + 1) % seats;
          const s = pub.seats[seat];
          if (!s) return null;
          return (
            <Seat
              key={seat}
              position={position}
              name={names[seat] ?? `Seat ${seat}`}
              color={SEAT_COLORS[seat] ?? "var(--y)"}
              avatar={game.avatars?.[seat] ?? null}
              handSize={s.handSize}
              active={pub.turn === seat}
              saidMono={s.saidMono && s.handSize === 1}
              fanRef={anchor(anchorKey.fan(seat))}
            />
          );
        })}
        {game.watching && pub.seats[HUMAN] && (
          <Seat
            position="bottom"
            name={names[HUMAN] ?? `Seat ${HUMAN}`}
            color={SEAT_COLORS[HUMAN] ?? "var(--y)"}
            avatar={game.avatars?.[HUMAN] ?? null}
            handSize={pub.seats[HUMAN].handSize}
            active={pub.turn === HUMAN}
            saidMono={pub.seats[HUMAN].saidMono && pub.seats[HUMAN].handSize === 1}
            fanRef={anchor(anchorKey.fan(HUMAN))}
          />
        )}
        <Center
          discard={pub.discard}
          color={pub.color}
          deckCount={pub.deckCount}
          dir={pub.dir}
          status={status}
          canDraw={mine && drawLabel === "Draw" && pub.drawFour === null && pub.pendingDraw === 0}
          colorBlind={colorBlind}
          onDraw={onDraw}
          deckRef={anchor(anchorKey.deck)}
          pileRef={anchor(anchorKey.pile)}
        />
        {game.feed.length > 0 && <Feed lines={game.feed} title="Table feed" />}
        <div className="kc-you" hidden={game.watching}>
          <Hand
            hand={hand}
            mine={mine}
            playable={playable}
            colorBlind={colorBlind}
            onPlay={onPlay}
            slotRef={(slot, el) => anchor(anchorKey.hand(slot))(el)}
            boxRef={anchor(anchorKey.handBox)}
          />
          <div className="kc-actions">
            <div className={cn("kc-who kc-me", mine && "kc-active")}>
              <div className="kc-avatar relative" style={{ "--c": avatarColor(game.avatars?.[HUMAN], SEAT_COLORS[HUMAN] ?? "var(--y)") } as React.CSSProperties}>
                <AvatarGlyph avatar={game.avatars?.[HUMAN]} letter="Y" />
                {game.secretColor !== undefined && <SecretBadge color={game.secretColor} />}
              </div>
              <div className="kc-meta">
                <b>You</b>
                <span>
                  <Eye aria-hidden />
                  only you can see this hand
                </span>
                {game.secretColor !== undefined && <SecretChip color={game.secretColor} />}
              </div>
            </div>
            {mine && pub.drawFour ? (
              <>
                <button type="button" className="kc-btn" onClick={() => run({ type: "accept" })}>
                  <Layers aria-hidden />
                  Take 4
                </button>
                <button type="button" className="kc-btn" onClick={() => run({ type: "challenge" })}>
                  <Swords aria-hidden />
                  Challenge
                </button>
              </>
            ) : mine && pub.pendingDraw > 0 ? (
              <button type="button" className="kc-btn" onClick={() => run({ type: "take" })}>
                <Layers aria-hidden />
                Take {pub.pendingDraw}
              </button>
            ) : (
              <button type="button" className="kc-btn" onClick={onDraw} disabled={!mine}>
                <Layers aria-hidden />
                <span>{drawLabel}</span>
              </button>
            )}
            {canDoubt && (
              <button type="button" className="kc-btn kc-hot" onClick={() => run({ type: "doubt" })}>
                <Swords aria-hidden />
                Doubt
              </button>
            )}
            {canVeil && (
              <button type="button" className="kc-btn" onClick={() => setVeiling(true)} disabled={busy} aria-label="Veil">
                <EyeOff aria-hidden />
                <span className="kc-hide-s">Veil</span>
              </button>
            )}
            {canSonar && (
              <button type="button" className="kc-btn" onClick={() => setPinging(true)} disabled={busy} aria-label="Sonar">
                <Radar aria-hidden />
                <span className="kc-hide-s">Sonar</span>
              </button>
            )}
            {catchable !== null ? (
              <button type="button" className="kc-btn kc-mono kc-hot" onClick={() => game.catchSeat(catchable)}>
                Catch!
              </button>
            ) : (
              <button type="button" className={cn("kc-btn kc-mono", monoHot && "kc-hot")} disabled={!canSayMono(pub, HUMAN) || busy} onClick={() => run({ type: "mono" })}>
                Mono!
              </button>
            )}
          </div>
        </div>
      </main>
      <Dialog open={pickingSlot !== null} onOpenChange={(open) => !open && setPickingSlot(null)}>
        <DialogContent className="kc-box border-2 border-cream bg-ink sm:max-w-[360px]" showCloseButton={false}>
          <DialogTitle className="font-display text-[30px] font-normal text-sun">Pick a colour</DialogTitle>
          <DialogDescription className="text-muted">Your wild sets the colour for the next player.</DialogDescription>
          <div className="kc-sw">
            {CARD_COLORS.map((c, i) => (
              <button key={c.name} type="button" aria-label={c.name} style={{ "--c": c.base } as React.CSSProperties} onClick={() => pick(i as Color)} />
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <SonarDialog
        open={pinging}
        pub={pub}
        me={HUMAN}
        names={names}
        onClose={() => setPinging(false)}
        onSonar={(target, color) => {
          setPinging(false);
          run({ type: "sonar", target, color });
        }}
      />
      <SonarResult sonar={game.sonar ?? null} names={names} onClose={() => game.clearSonar?.()} />
      <VeilDialog
        open={veiling}
        pub={pub}
        hand={hand}
        colorBlind={colorBlind}
        onClose={() => setVeiling(false)}
        onVeil={(slot, claim) => {
          setVeiling(false);
          run({ type: "veil", slot, claim });
        }}
      />
      <PeekDialog open={peekSlot !== null} pub={pub} me={HUMAN} names={names} onClose={() => setPeekSlot(null)} onPeek={peekAt} />
      <PeekResult peek={game.peek ?? null} names={names} colorBlind={colorBlind} onClose={() => game.clearPeek?.()} />
      <Dialog open={pub.stage === "MatchOver" && !busy}>
        <DialogContent className="kc-box border-2 border-cream bg-ink sm:max-w-[360px]" showCloseButton={false}>
          <DialogTitle className="font-display text-[30px] font-normal text-sun">
            {result?.winner === HUMAN && !game.watching ? "You win!" : result?.winner === null ? "No winner" : `${names[result?.winner ?? 0] ?? "Seat"} wins`}
          </DialogTitle>
          <DialogDescription className="text-muted">
            {result ? `${result.points} points${result.bonus ? " · doubled by the secret colour" : ""} · every honesty bit checked${result.cheaters.length > 0 ? ` · liars: ${result.cheaters.map((s) => (s === HUMAN && !game.watching ? "you" : names[s])).join(", ")}` : ""}` : ""}
          </DialogDescription>
          {result?.secrets && result.secrets.some((c) => c >= 0) && (
            <ul className="grid gap-1 text-sm text-cream">
              {result.secrets.map((color, seat) => (
                <li key={seat} className="flex items-center justify-between gap-3">
                  <span>{seat === HUMAN && !game.watching ? "You" : names[seat]}</span>
                  <span className="flex items-center gap-1" style={{ color: CARD_COLORS[color]?.base }}>
                    <span className="inline-block size-2.5 rounded-full" style={{ background: CARD_COLORS[color]?.base }} aria-hidden />
                    {CARD_COLORS[color]?.name ?? "hidden"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap justify-center gap-3">
            {game.restart && (
              <button type="button" className="kc-btn" onClick={game.restart}>
                <Shuffle aria-hidden />
                Deal again
              </button>
            )}
            <Link href={game.mode === "chain" ? "/new" : "/"} className="kc-btn">
              <House aria-hidden />
              Menu
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden>
      {CARD_COLORS.map((c, i) => {
        const span = (Math.PI * 2) / CARD_COLORS.length;
        const a0 = i * span - Math.PI / 2;
        const a1 = a0 + span;
        return <path key={c.name} d={`M20 20L${20 + 17 * Math.cos(a0)} ${20 + 17 * Math.sin(a0)}A17 17 0 0 1 ${20 + 17 * Math.cos(a1)} ${20 + 17 * Math.sin(a1)}Z`} fill={c.base} />;
      })}
      <circle cx="20" cy="20" r="17" fill="none" stroke="var(--cream)" strokeWidth="2.5" />
      <circle cx="20" cy="20" r="6" fill="var(--ink)" stroke="var(--cream)" strokeWidth="2" />
    </svg>
  );
}

function statusText(stage: string, turn: number, me: number, names: readonly string[], busy: boolean, drawn: boolean, drawFour: boolean, pending: number): string {
  if (stage === "AwaitChallenge") return "Revealing one bit…";
  if (stage === "Revealing") return "Revealing hands…";
  if (stage === "MatchOver") return "Round over";
  if (turn !== me) return `${names[turn] ?? "Bot"} is playing…`;
  if (busy) return "Waiting for the table…";
  if (drawFour) return "Wild +4 on you: take 4 or challenge";
  if (pending > 0) return `Stack a +2 or take ${pending}`;
  return drawn ? "Play the drawn card or pass" : "Your turn";
}
