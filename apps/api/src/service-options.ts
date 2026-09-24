import { BadRequestException } from '@nestjs/common';
import { serviceDurationOptions, type ServiceDto } from '@booking/contracts';

export const selectServiceOption = (service: ServiceDto, durationMinutes?: number) => {
  const options = serviceDurationOptions(service);
  if (durationMinutes === undefined && options.length > 1) throw new BadRequestException('Choose a service duration before checking availability or booking');
  const option = durationMinutes === undefined ? options[0] : options.find((item) => item.durationMinutes === durationMinutes);
  if (!option) throw new BadRequestException('This duration is not offered for the service');
  return option;
};
