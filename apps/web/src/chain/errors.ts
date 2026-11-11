import { BaseError, InsufficientFundsError, RpcRequestError, UserRejectedRequestError } from "viem";

const GENERIC = "Something went wrong, please try again";
const MAX_LENGTH = 160;

const KNOWN: readonly (readonly [RegExp, string])[] = [
  [/TableFull/, "This table is already full"],
  [/AlreadySeated/, "You already sit at this table"],
  [/WrongStage/, "The table has already started"],
  [/BadSession/, "This session key can not join, reload the page and try again"],
  [/switch your wallet|wrong.?chain|chain mismatch/i, "Switch your wallet to Sepolia first"],
  [/timed out|timeout/i, "Sepolia is slow right now, please try again in a minute"],
];

function walk(error: unknown, test: (e: unknown) => boolean): boolean {
  if (test(error)) return true;
  return error instanceof BaseError ? Boolean(error.walk((e) => test(e))) : false;
}

export function isFundsLag(error: unknown): boolean {
  return walk(error, (e) => e instanceof InsufficientFundsError || (e instanceof Error && /insufficient funds/i.test(e.message)));
}

export function friendlyError(error: unknown): string {
  if (!(error instanceof Error)) return GENERIC;
  if (walk(error, (e) => e instanceof UserRejectedRequestError)) return "You cancelled the request in your wallet";
  if (isFundsLag(error)) return "Your session key is still waiting for its test ETH, try again in a few seconds";
  const text = error instanceof BaseError ? `${error.shortMessage} ${error.details ?? ""}` : error.message;
  for (const [pattern, message] of KNOWN) if (pattern.test(text)) return message;
  if (walk(error, (e) => e instanceof RpcRequestError)) return "The Sepolia node did not answer, please try again";
  const first = (error instanceof BaseError ? error.shortMessage : error.message).split("\n")[0]?.trim();
  return first ? first.slice(0, MAX_LENGTH) : GENERIC;
}
