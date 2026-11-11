import { avatarOf, cleanName, parseAvatar, profileMessage, validProfile } from "@kryphochroma/abi";
import { describe, expect, it } from "vitest";
import { MAX_LOOKUP, MAX_PROFILES, emptyStore, fromDisk, lookup, parseAddresses, putProfile, toDisk } from "../src/service/profiles.js";

const A = "0x00000000000000000000000000000000000000aa";
const B = "0x00000000000000000000000000000000000000bb";

describe("profile rules", () => {
  it("accepts short readable names in any alphabet and refuses markup or noise", () => {
    expect(cleanName("  Олексій  ")).toBe("Олексій");
    expect(cleanName("teal  fox_9")).toBe("teal fox_9");
    expect(cleanName("a")).toBeNull();
    expect(cleanName("x".repeat(17))).toBeNull();
    expect(cleanName("<script>")).toBeNull();
    expect(cleanName("-dash")).toBeNull();
  });

  it("only knows the shipped avatars", () => {
    expect(parseAvatar(avatarOf("dog", 2))).toEqual({ icon: "dog", color: 2 });
    expect(parseAvatar("dog-5")).toBeNull();
    expect(parseAvatar("dragon-1")).toBeNull();
    expect(validProfile({ name: "Mira", avatar: "bird-3" })).toEqual({ name: "Mira", avatar: "bird-3" });
    expect(validProfile({ name: "Mira", avatar: 3 })).toBeNull();
    expect(profileMessage({ name: "Mira", avatar: "bird-3" })).toBe("Kryphochroma profile\nname: Mira\navatar: bird-3");
  });
});

describe("profile store", () => {
  it("keeps the latest profile per address, case blind, and prefers fixed bot names", () => {
    let store = putProfile(emptyStore(), A.toUpperCase().replace("0X", "0x"), { name: "Old", avatar: "cat-0" }, 1);
    store = putProfile(store, A, { name: "New", avatar: "cat-1" }, 2);
    const fixed = new Map([[B, { name: "Mira", avatar: "bird-2" }]]);
    expect(lookup(store, fixed, [A, B])).toEqual({ [A]: { name: "New", avatar: "cat-1" }, [B]: { name: "Mira", avatar: "bird-2" } });
  });

  it("caps the store and the lookup size", () => {
    let store = emptyStore();
    for (let i = 0; i <= MAX_PROFILES; i++) store = putProfile(store, `0x${i.toString(16).padStart(40, "0")}`, { name: "Pal", avatar: "dog-0" }, i);
    expect(store.byAddress.size).toBe(MAX_PROFILES);
    expect(store.byAddress.has(`0x${"0".repeat(40)}`)).toBe(false);
    expect(parseAddresses([...Array(20)].map(() => A).join(",") + ",nope")).toHaveLength(MAX_LOOKUP);
  });

  it("survives a round trip to disk and drops bad rows", () => {
    const store = putProfile(emptyStore(), A, { name: "Mira", avatar: "bird-2" }, 5);
    const back = fromDisk(toDisk(store));
    expect(lookup(back, new Map(), [A])).toEqual({ [A]: { name: "Mira", avatar: "bird-2" } });
    expect(fromDisk('[["0xzz",{"name":"x"}]]').byAddress.size).toBe(0);
    expect(fromDisk("garbage").byAddress.size).toBe(0);
  });
});
