# Kryphochroma

A shedding card game in the Crazy Eights family where nobody can peek. Hands and the deck live on Sepolia as Zama FHE ciphertexts: each player decrypts only their own cards, the contract shuffles the deck with encrypted randomness, and it checks every move without seeing a single card.

Status: in development for the Zama Developer Program, Season 5, Confidential Gaming.

## Why it needs FHE

| Data | Who can read it | What breaks if it were public |
|---|---|---|
| Cards in hand | only the owner | everyone sees every hand, bluffing is gone |
| Deck order | nobody, not even the contract | you know what you and your rivals draw next |
| "Had a matching colour" bit on a Wild Draw Four | nobody until challenged, then 1 bit | proving an honest +4 would mean showing your hand |
| Honesty of each move | nobody until the round ends | |

## How it works

- The deck is 108 `euint8` handles. A network of encrypted switches (`FHE.randEbool` + `FHE.select`) shuffles it, one layer per transaction, 28 layers in total.
- Drawing a card copies the next handle into your hand and grants your session key access with `FHE.allow`. Nobody else can decrypt it.
- When you play, you say which card it is. The contract keeps `honest &= (hand[slot] == card)` encrypted and reveals it once at the end of the round. A liar loses the round.
- A Wild Draw Four challenge reveals exactly one bit, computed with `FHE.isIn` over the colours of your other cards.
- Every reveal goes through `FHE.checkSignatures` against a stored handle and moves the game stage forward, so a proof can not be replayed.

## Repository

| Path | What |
|---|---|
| `contracts/` | Solidity contracts, Hardhat 3 with the FHEVM plugin |
| `packages/rules` | rules engine shared by the client, the bots and the tests |
| `packages/cards` | SVG card faces and backs |

## Run locally

Node 22.23.4 or newer and pnpm 10.

```bash
pnpm install
pnpm test
```

## License

MIT
