import { publicServiceSchema } from "@booking/contracts";

export const publicApi = {
  services: async (signal?: AbortSignal) => {
    const response = await fetch("/api/public/services", {
      signal,
      cache: "no-store",
      credentials: "omit",
    });
    if (!response.ok)
      throw new Error(`API request failed (${response.status})`);
    return publicServiceSchema.array().parse(await response.json());
  },
};
