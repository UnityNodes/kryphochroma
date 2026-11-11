import { BaseError, HttpRequestError, InsufficientFundsError, InvalidParamsRpcError, RpcRequestError, UserRejectedRequestError } from "viem";
import { describe, expect, it } from "vitest";
import { friendlyError, isFundsLag } from "@/chain/errors";

describe("friendly errors", () => {
  it("explains the common chain failures in plain words", () => {
    expect(friendlyError(new InsufficientFundsError())).toMatch(/test ETH/);
    expect(friendlyError(new RpcRequestError({ body: {}, error: { code: -32603, message: "boom" }, url: "https://x" }))).toMatch(/Sepolia node/);
    expect(friendlyError(new RpcRequestError({ body: {}, error: { code: -32603, message: "boom" }, url: "https://x" }))).toContain("(code -32603)");
    expect(friendlyError(new HttpRequestError({ status: 429, url: "https://x" }))).toBe("The Sepolia node did not answer (HTTP 429), please try again");
    expect(friendlyError(new InvalidParamsRpcError(new Error("Missing or invalid parameters")))).toMatch(/Sepolia node/);
    expect(friendlyError(new UserRejectedRequestError(new Error("no")))).toMatch(/cancelled/);
    expect(friendlyError(new Error("The faucet is busy, try again in a minute"))).toBe("The faucet is busy, try again in a minute");
    expect(friendlyError(new BaseError("Execution reverted with reason: TableFull()."))).toMatch(/full/);
    expect(friendlyError("weird")).toBe("Something went wrong, please try again");
  });

  it("never shows a raw multi line dump", () => {
    const text = friendlyError(new Error(`first line\n\nRequest body: {"method":"eth_sendRawTransaction"}`));
    expect(text).toBe("first line");
  });

  it("treats missing funds as a node that has not caught up yet", () => {
    expect(isFundsLag(new InsufficientFundsError())).toBe(true);
    expect(isFundsLag(new BaseError("insufficient funds for gas * price + value: have 0 want 2"))).toBe(true);
    expect(isFundsLag(new Error("nonce too low"))).toBe(false);
  });
});
