"use client";

import { CARD_COLORS, PALETTE, sharedDefs } from "@kryphochroma/cards";
import { type Color, type Peek, canDraw, cardLabel, canSayMono, botCatchTarget, isPlayable, isSpyglass, isWild, lastCardWaits, legalMoves, veilClaims } from "@kryphochroma/rules";
import { ArrowLeft, BadgeCheck, Box, Eye, EyeOff, House, Layers, Play, Radar, Shapes, Shuffle, Swords, Trophy, Volume2, VolumeX, WifiOff } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { autoPassKey } from "@/game/autoPass";
import { anchorKey } from "@/game/flight";
import type { TableController } from "@/game/controller";
import { SEAT_COLORS } from "@/game/offline";
import { SOUND_FOR_ICON } from "@/game/sound";
import { useAutoPass } from "@/game/useAutoPass";
import { useRadio } from "@/game/useRadio";
import { useSound } from "@/game/useSound";
import { useOfflineGame } from "@/game/useOfflineGame";
import { useTableView } from "@/game/useTableView";
import { cn } from "@/lib/utils";
import { Center } from "./Center";
import { RoundEndProgress, WaitHint, challengeNote, lastCardNote, refillNote, sealedCardNote } from "./ChainProgress";
import { Feed } from "./Feed";
import { Hand } from "./Hand";
import { HowToPlay } from "./HowToPlay";
import { PeekDialog, PeekResult, SecretBadge, SecretChip, SonarDialog, SonarResult, VeilDialog } from "./Mechanics";
import { MonoBurst } from "./MonoBurst";
import { RadioChip } from "./RadioChip";
import { AvatarGlyph, avatarColor } from "@/components/profile/Avatar";
import { Table3dSurface } from "@/components/table3d/Table3dSurface";
import { modelOf } from "@/components/table3d/model";
import { Seat } from "./Seat";
import { tint } from "./tint";

const WORDMARK = "KRYPHOCHROMA";
const POSITIONS: Record<number, readonly ("left" | "top" | "right")[]> = { 2: ["top"], 3: ["left", "right"], 4: ["left", "top", "right"] };

const ERROR_TEXT: Record<string, string> = {
  IllegalCard: "That card does not match the colour or the number",
  MustPlayDrawnCard: "You can only play the card you just drew",
  MustStackOrTake: "Stack a draw two or take the cards",
  CannotPass: "Draw a card before passing",
  VeilUsed: "You already veiled a card this round",
  DoubtPending: "Your last card waits for the veil check",
  NoVeil: "There is no veil to doubt",
  BadPeek: "Pick a card in an opponent's hand",
  BadSonar: "Sonar works once per round, on a rival, for one of the five colours",
  IllegalMove: "That move is not allowed right now",
  WrongStage: "The round is not being played right now",
  NotYourTurn: "It is not your turn",
  BadSignature: "This tab is not seated at the table",
  CannotCatch: "Nobody can be caught right now",
  CatchTooEarly: "Give them a moment to say Mono first",
  "bots service unavailable": "The table server is restarting, try again in a few seconds",
  "slow down": "Too many moves at once, wait a second",
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
      void act(move).then(
        (error) => {
          if (error) toast.error(ERROR_TEXT[error] ?? error);
        },
        () => toast.error("Your move did not go through, try again"),
      );
    },
    [act],
  );

  const playable = useCallback((slot: number) => moves.some((m) => m.type === "play" && m.slot === slot), [moves]);
  const { view, choose, fallBack } = useTableView();
  const is3d = view === "3d";
  const watching = Boolean(game.watching);
  const model = useMemo(() => modelOf(state, HUMAN, watching, (slot) => mine && playable(slot)), [state, HUMAN, watching, mine, playable]);
  const warned = useRef(false);
  const onUnavailable = useCallback(() => {
    fallBack();
    if (warned.current) return;
    warned.current = true;
    toast.message("The 3D table could not start in this browser, showing the 2D table");
  }, [fallBack]);
  useEffect(() => {
    if (!is3d) return;
    document.documentElement.dataset.kcSurface = "3d";
    return () => {
      delete document.documentElement.dataset.kcSurface;
    };
  }, [is3d]);

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
  const passDue = game.watching || busy ? null : autoPassKey(pub, HUMAN, hand);
  const passOn = useCallback(() => run({ type: "pass" }), [run]);
  useAutoPass(passDue, passOn);
  const monoHot = canSayMono(pub, HUMAN) && hand.some((c) => c !== null && isPlayable(pub, c));
  const catchable = botCatchTarget(pub, HUMAN);
  const meSeat = pub.seats[HUMAN];
  const radio = useRadio();
  const canSonar = mine && !game.watching && !!meSeat && !meSeat.sonarUsed && pub.pendingDraw === 0 && pub.drawFour === null && pub.drawnSlot === null;
  const canVeil = mine && !!meSeat && !meSeat.veilUsed && meSeat.handSize >= 2 && pub.pendingDraw === 0 && pub.drawFour === null && pub.doubt === null && passDue === null && veilClaims(pub).length > 0;
  const canDoubt = mine && pub.veil !== null && pub.veil.judge === HUMAN && pub.drawnSlot === null;
  const lastWaits = mine && !game.watching && lastCardWaits(pub, HUMAN, hand);
  const status = canDoubt && pub.veil ? `${names[pub.veil.by] ?? "Someone"} veiled a card as ${cardLabel(pub.veil.claim)}: doubt it or play on` : lastWaits ? "Your last card waits for the veil check" : passDue !== null ? "Drawn card does not fit, passing on…" : statusText(pub.stage, pub.turn, game.watching ? -1 : HUMAN, names, busy, drawn, pub.drawFour !== null, pub.pendingDraw, !canDraw(pub, HUMAN));
  const seats = pub.config.seats;
  const opponents = POSITIONS[seats] ?? [];
  const result = pub.lastResult;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (document.querySelector('[role="dialog"]')) return;
      if ((e.code === "KeyD" || e.key === "d" || e.key === "D") && mine) onDraw();
      if ((e.code === "KeyM" || e.key === "m" || e.key === "M") && canSayMono(pub, HUMAN)) run({ type: "mono" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className={cn("kc-app", is3d && "kc-app-3d")}>
      <div aria-hidden dangerouslySetInnerHTML={{ __html: sharedDefs() }} />
      <header className="kc-top">
        <Link href="/" className="kc-brand" aria-label="Kryphochroma, back to the menu">
          <span className="kc-back" aria-hidden>
            <ArrowLeft />
          </span>
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
              <span className="kc-dot" aria-hidden />
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
          <button type="button" className={cn("kc-chip", is3d && "kc-chip-on")} aria-pressed={is3d} aria-label="3D table" onClick={() => choose(is3d ? "2d" : "3d")}>
            <Box aria-hidden />
            <span className="kc-hide-s">{is3d ? "3D" : "2D"}</span>
          </button>
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
      <main className={cn("kc-table", is3d && "kc-3d")}>
        {is3d && <Table3dSurface model={model} playing={game.playing ?? null} shapes={colorBlind} me={HUMAN} onUnavailable={onUnavailable} />}
        <MonoBurst actor={burst.actor} stamp={burst.stamp} />
        <div className="kc-baize" aria-hidden />
        <div className="kc-print" aria-hidden>
          {WORDMARK}
        </div>
        {opponents.map((position, i) => {
          const seat = (HUMAN + i + 1) % seats;
          const s = pub.seats[seat];
          if (!s) return null;
          return (
            <Seat
              key={seat}
              seat={seat}
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
            seat={HUMAN}
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
          note={challengeNote(game.sync, pub.stage) ?? lastCardNote(game.sync, lastWaits) ?? (game.watching ? null : (sealedCardNote(game.sync, hand.filter((c) => c !== null && c < 0).length, hand.filter((c) => c !== null).length) ?? (pub.stage === "Playing" ? refillNote(game.sync, pub.deckCount) : null)))}
          canDraw={mine && drawLabel === "Draw" && pub.drawFour === null && pub.pendingDraw === 0}
          colorBlind={colorBlind}
          veiled={is3d && pub.veil ? `Veiled as ${cardLabel(pub.veil.claim)}` : null}
          onDraw={onDraw}
          deckRef={anchor(anchorKey.deck)}
          pileRef={anchor(anchorKey.pile)}
        />
        {game.feed.length > 0 && <Feed lines={game.feed} title="Table feed" />}
        {pub.stage === "Revealing" && !result && game.sync && <RoundEndProgress sync={game.sync} winner={roundLeader(pub.seats, names)} />}
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
                <button type="button" className="kc-btn kc-btn-brass" onClick={() => run({ type: "accept" })}>
                  <Layers aria-hidden />
                  Take 4
                </button>
                <button type="button" className="kc-btn" onClick={() => run({ type: "challenge" })}>
                  <Swords aria-hidden />
                  Challenge
                </button>
              </>
            ) : mine && pub.pendingDraw > 0 ? (
              <button type="button" className="kc-btn kc-btn-brass" onClick={() => run({ type: "take" })}>
                <Layers aria-hidden />
                Take {pub.pendingDraw}
              </button>
            ) : (
              <button type="button" className="kc-btn kc-btn-brass" onClick={onDraw} disabled={!mine}>
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
        <DialogContent className="kc-box" showCloseButton={false}>
          <DialogTitle>Pick a colour</DialogTitle>
          <DialogDescription>Your wild sets the colour for the next player.</DialogDescription>
          <div className="kc-sw">
            {CARD_COLORS.map((c, i) => (
              <button key={c.name} type="button" aria-label={c.name} style={{ "--c": c.base } as React.CSSProperties} onClick={() => pick(i as Color)}>
                {c.name}
              </button>
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
        <DialogContent className="kc-box" showCloseButton={false}>
          <DialogTitle>
            {!result ? "Round over" : result.winner === HUMAN && !game.watching ? "You win!" : result.winner === null ? "No winner" : `${names[result.winner] ?? "Seat"} wins`}
          </DialogTitle>
          <DialogDescription>
            {result
              ? result.winner === null
                ? "Every hand was revealed and nobody played honestly, so nobody scores."
                : `${result.points} points: the value of every card left in the other hands${result.bonus ? ", doubled by the secret colour" : ""}. ${game.verifying ? "Zama KMS is now proving every hand and honesty bit on chain." : "All honesty bits were revealed and checked on chain."}`
              : "This round was settled on Sepolia. Reading the result from the chain."}
          </DialogDescription>
          {result && game.mode === "chain" && (
            game.verifying ? (
              <WaitHint note={{ title: "Proving the score on Sepolia", why: "The hands are already open, so the score is shown at once. Zama KMS now decrypts them in public and the contract checks its signatures, usually 15 to 40 s. You can start a new game meanwhile." }} />
            ) : (
              <p className="flex items-start gap-2 text-left text-xs font-semibold text-muted" role="status">
                <BadgeCheck className="mt-px size-3.5 shrink-0 text-teal" aria-hidden />
                Verified on Sepolia: every hand and honesty bit checked against the KMS proof
              </p>
            )
          )}
          {result && (
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Round results</caption>
              <thead className="text-[11px] tracking-[.08em] text-muted uppercase">
                <tr>
                  <th scope="col" className="pb-2 font-semibold">Player</th>
                  <th scope="col" className="pb-2 text-right font-semibold">Cards left</th>
                  <th scope="col" className="pb-2 text-right font-semibold">Secret colour</th>
                </tr>
              </thead>
              <tbody>
                {pub.seats.map((s, seat) => {
                  const color = result.secrets?.[seat] ?? -1;
                  const swatch = color >= 0 ? CARD_COLORS[color] : undefined;
                  const won = result.winner === seat;
                  const lied = result.cheaters.includes(seat);
                  return (
                    <tr key={seat} className={cn("border-t border-cream/10", won && "text-brass")}>
                      <th scope="row" className="py-2 font-semibold">
                        {seat === HUMAN && !game.watching ? "You" : names[seat]}
                        {won && <Trophy className="ml-1 inline size-3.5" aria-label="winner" />}
                        {lied && <span className="ml-1 rounded-[3px] bg-red px-1.5 py-0.5 text-[11px] font-semibold text-bg">lied</span>}
                      </th>
                      <td className="py-2 text-right tabular-nums">{s.handSize === 0 ? "out" : s.handSize}</td>
                      <td className="py-2 text-right">
                        {swatch ? (
                          <span className="inline-flex items-center gap-1" style={{ color: tint(swatch.base) }}>
                            <span className="inline-block size-2.5 rounded-[2px]" style={{ background: swatch.base }} aria-hidden />
                            {swatch.name}
                          </span>
                        ) : (
                          <span className="text-muted">sealed</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div className="flex flex-wrap justify-center gap-3">
            {game.restart && (
              <button type="button" className="kc-btn kc-btn-brass" onClick={game.restart}>
                <Shuffle aria-hidden />
                Deal again
              </button>
            )}
            {game.mode === "chain" && (
              <Link href="/new" className="kc-btn kc-btn-brass">
                <Play aria-hidden />
                Play again
              </Link>
            )}
            <Link href="/" className="kc-btn">
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
  const [red, , teal] = CARD_COLORS;
  return (
    <svg viewBox="0 0 96 96" aria-hidden>
      <g transform="rotate(40 60 34)">
        <rect x="47" y="7" width="26" height="54" rx="6" fill="var(--cream)" />
        <rect x="52" y="12" width="16" height="44" rx="2.5" fill={red?.base} />
      </g>
      <g transform="rotate(-40 60 62)">
        <rect x="47" y="35" width="26" height="54" rx="6" fill="var(--cream)" />
        <rect x="52" y="40" width="16" height="44" rx="2.5" fill={teal?.base} />
      </g>
      <rect x="12" y="8" width="30" height="80" rx="7" fill="var(--cream)" />
      <rect x="18" y="14" width="18" height="68" rx="3" fill={PALETTE.ink} />
      <circle cx="27" cy="48" r="4.5" fill="var(--brass)" />
    </svg>
  );
}

function roundLeader(seats: readonly { readonly handSize: number }[], names: readonly string[]): string | null {
  const out = seats.findIndex((s) => s.handSize === 0);
  return out >= 0 ? (names[out] ?? null) : null;
}

function statusText(stage: string, turn: number, me: number, names: readonly string[], busy: boolean, drawn: boolean, drawFour: boolean, pending: number, deckShut: boolean): string {
  if (stage === "AwaitChallenge") return "Revealing one bit…";
  if (stage === "Revealing") return "Revealing hands…";
  if (stage === "MatchOver") return "Round over";
  if (turn !== me) return `${names[turn] ?? "Bot"} is playing…`;
  if (busy) return "Waiting for the table…";
  if (drawFour) return "Wild +4 on you: take 4 or challenge";
  if (pending > 0) return `Stack a +2 or take ${pending}`;
  if (drawn) return "Play the drawn card or pass";
  return deckShut ? "No card to draw: play or pass" : "Your turn";
}
