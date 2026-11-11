import { rpcUrls } from "@kryphochroma/abi";
import { fallback, http } from "viem";

export function rpcTransport(primary: string) {
  return fallback(rpcUrls(primary).map((url) => http(url)));
}
