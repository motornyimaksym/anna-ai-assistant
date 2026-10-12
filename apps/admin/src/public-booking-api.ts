import {
  publicBookingServiceSchema,
  publicBookingSlotsResponseSchema,
  publicBookingStartResponseSchema,
  publicBookingStatusResponseSchema,
  type PublicBookingStartRequest,
} from "@booking/contracts";

export class PublicBookingApiError extends Error {
  constructor(readonly status: number) {
    super(`Public booking request failed (${status})`);
  }
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`/api/public/booking${path}`, {
    ...init,
    cache: "no-store",
    credentials: "omit",
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!response.ok) throw new PublicBookingApiError(response.status);
  return response.json();
}

export const publicBookingApi = {
  services: async (signal?: AbortSignal) =>
    publicBookingServiceSchema.array().parse(
      await request("/services", { method: "GET", signal }),
    ),
  slots: async (input: { serviceId: string; durationMinutes: number; date: string }, signal?: AbortSignal) =>
    publicBookingSlotsResponseSchema.parse(
      await request("/slots", { method: "POST", body: JSON.stringify(input), signal }),
    ),
  start: async (input: PublicBookingStartRequest) =>
    publicBookingStartResponseSchema.parse(
      await request("/reservations", { method: "POST", body: JSON.stringify(input) }),
    ),
  status: async (id: string, token: string) => {
    return publicBookingStatusResponseSchema.parse(
      await request(`/reservations/${encodeURIComponent(id)}`, { method: "GET", headers: { "x-reservation-token": token } }),
    );
  },
};
