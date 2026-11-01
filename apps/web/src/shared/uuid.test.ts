import { afterEach, expect, it, vi } from "vitest";
import { randomUUID } from "./uuid";

afterEach(() => vi.unstubAllGlobals());

it("utiliza el generador nativo cuando está disponible", () => {
  const native = vi.fn(() => "00112233-4455-4677-8899-aabbccddeeff");
  vi.stubGlobal("crypto", { randomUUID: native });
  expect(randomUUID()).toBe("00112233-4455-4677-8899-aabbccddeeff");
  expect(native).toHaveBeenCalledOnce();
});

it("en HTTP conserva entropía criptográfica y los bits de UUID v4", () => {
  const getRandomValues = vi.fn((bytes: Uint8Array) => {
    bytes.set(Array.from({ length: 16 }, (_, i) => i * 17));
    return bytes;
  });
  vi.stubGlobal("crypto", { getRandomValues });
  expect(randomUUID()).toBe("00112233-4455-4677-8899-aabbccddeeff");
  expect(getRandomValues).toHaveBeenCalledOnce();
});

it("no sustituye un fallo criptográfico por aleatoriedad débil", () => {
  vi.stubGlobal("crypto", {
    getRandomValues: () => {
      throw new Error("Unavailable");
    },
  });
  expect(() => randomUUID()).toThrow("Unavailable");
});
