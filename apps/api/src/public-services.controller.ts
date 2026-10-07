import { Controller, Get, Header, Inject } from "@nestjs/common";
import { publicServiceSchema } from "@booking/contracts";
import { BookingRepository } from "./repository.js";

@Controller("public")
export class PublicServicesController {
  constructor(
    @Inject(BookingRepository) private readonly repository: BookingRepository,
  ) {}

  @Get("services")
  @Header("Cache-Control", "no-store")
  async services() {
    const services = await this.repository.listServices();
    return publicServiceSchema
      .array()
      .parse(services.filter((service) => service.enabled));
  }
}
