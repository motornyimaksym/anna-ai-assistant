import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { PublicServicesController } from "../src/public-services.controller.js";
import { BookingRepository } from "../src/repository.js";

const enabled = {
  id: "relax",
  name: "Релакс",
  durationMinutes: 60,
  price: 1750,
  currency: "UAH",
  durationOptions: [{ durationMinutes: 90, price: 2400 }],
  enabled: true,
  bufferMinutes: 30,
  description: "private",
  telegramCaption: { text: "private" },
  photoUrl: "private",
};
const listServices = vi.fn();
let app: INestApplication;
let origin: string;
beforeAll(async () => {
  const module = await Test.createTestingModule({
    controllers: [PublicServicesController],
    providers: [{ provide: BookingRepository, useValue: { listServices } }],
  }).compile();
  app = module.createNestApplication();
  await app.listen(0, "127.0.0.1");
  origin = await app.getUrl();
});
afterAll(async () => {
  await app.close();
});
describe("public services catalog", () => {
  it("serves only enabled public price fields without authentication", async () => {
    listServices.mockResolvedValueOnce([
      enabled,
      { ...enabled, id: "disabled", enabled: false },
    ]);
    const response = await fetch(`${origin}/public/services`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual([
      {
        id: "relax",
        name: "Релакс",
        durationMinutes: 60,
        price: 1750,
        currency: "UAH",
        durationOptions: [{ durationMinutes: 90, price: 2400 }],
      },
    ]);
  });
  it("returns an empty catalog without inventing defaults", async () => {
    listServices.mockResolvedValueOnce([]);
    const response = await fetch(`${origin}/public/services`);
    expect(await response.json()).toEqual([]);
  });
  it("does not expose catalog mutation routes", async () => {
    expect(
      (await fetch(`${origin}/public/services`, { method: "POST" })).status,
    ).toBe(404);
  });
});
