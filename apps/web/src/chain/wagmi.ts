import { createConfig, injected } from "wagmi";
import { sepolia } from "wagmi/chains";
import { sepoliaTransport } from "./rpc";

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: { [sepolia.id]: sepoliaTransport() },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
