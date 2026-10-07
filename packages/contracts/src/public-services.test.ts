import { describe, expect, it } from "vitest";
import { publicServiceSchema } from "./index.js";
describe("public service contract", () => {
  it("strips internal fields and validates duration/price facts", () => {
    const data = {
      id: "a",
      name: "A",
      durationMinutes: 60,
      price: 100,
      currency: "UAH",
      enabled: true,
      bufferMinutes: 30,
    };
    expect(Object.keys(publicServiceSchema.parse(data)).sort()).toEqual([
      "currency",
      "durationMinutes",
      "id",
      "name",
      "price",
    ]);
    expect(publicServiceSchema.safeParse({ ...data, price: -1 }).success).toBe(
      false,
    );
    expect(
      publicServiceSchema.safeParse({
        ...data,
        durationOptions: [{ durationMinutes: 60, price: 200 }],
      }).success,
    ).toBe(false);
  });
});
