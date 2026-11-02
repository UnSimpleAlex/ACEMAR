import { describe, it, expect } from "vitest";
import { lineTotal, total } from "./money";
describe("importes comerciales", () => {
  it("suma el ejemplo aprobado sin error binario", () => {
    expect(
      total([
        { quantity: 2, price: 32.5 },
        { quantity: 1, price: 8 },
      ]),
    ).toBe(73);
  });
  it("redondea cada línea a céntimos con HALF_UP", () => {
    expect(lineTotal(1, 1.005)).toBe(1.01);
    expect(
      total([
        { quantity: 1, price: 1.005 },
        { quantity: 1, price: 1.005 },
      ]),
    ).toBe(2.02);
  });
});
