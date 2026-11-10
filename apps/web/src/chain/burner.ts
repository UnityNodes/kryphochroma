import { type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

const STORAGE_KEY = "kc-burner";

export function loadBurner(storage: Pick<Storage, "getItem" | "setItem">): PrivateKeyAccount {
  const saved = storage.getItem(STORAGE_KEY);
  if (saved && /^0x[0-9a-fA-F]{64}$/.test(saved)) return privateKeyToAccount(saved as Hex);
  const key = generatePrivateKey();
  storage.setItem(STORAGE_KEY, key);
  return privateKeyToAccount(key);
}
