import z from 'zod';
import {
  format,
  getYear,
  getMonth,
  getDate,
  getHours,
  getMinutes,
  getSeconds,
  differenceInSeconds,
  add,
} from 'date-fns';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { PrismaService } from 'src/prisma.service';
import { contract } from 'api-contract';

type TSchedule = z.infer<typeof contract.schedules.create.body>;
@Injectable()
export class SchedulesService {
  constructor(private prisma: PrismaService) {}
  async create(schedule: Omit<TSchedule, 'id'>) {
    try {
      const result = await this.prisma.$transaction(async (prisma) => {
        const newSchedule = await prisma.schedule.create({
          data: {
            eventDuration: schedule.eventDuration,
            userId: schedule.userId,
          },
        });

        const dailyTimings = [
          {
            dayOfWeek: 'MONDAY',
            start: new Date('2023-01-01T09:00:00'),
            end: new Date('2023-01-01T10:00:00'),
            scheduleId: newSchedule.id,
          },
          {
            dayOfWeek: 'TUESDAY',
            start: new Date('2023-01-01T08:00:00'),
            end: new Date('2023-01-01T16:30:00'),
            scheduleId: newSchedule.id,
          },
        ];

        const createdDailyTimings =
          await prisma.dailyTiming.createManyAndReturn({
            data: dailyTimings as TSchedule['dailyTimings'],
          });

        const finalSchedule = await prisma.schedule.update({
          where: { id: newSchedule.id },
          data: { dailyTimings: { connect: createdDailyTimings } },
          include: { dailyTimings: true },
        });

        return finalSchedule;
      });

      return result;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException('Invalid schedule data provided');
      }

      throw new InternalServerErrorException('Failed to create schedule');
    }
  }

  async edit(scheduleId: string, schedule: Partial<Omit<TSchedule, 'id'>>) {
    try {
      const updatedSchedule = this.prisma.schedule.update({
        where: { id: scheduleId },
        data: {
          eventDuration: schedule?.eventDuration,
          userId: schedule?.userId,
          dailyTimings: schedule?.dailyTimings
            ? {
                upsert: schedule.dailyTimings.map((timing) => ({
                  where: { id: timing.id },
                  update: timing,
                  create: timing,
                })),
              }
            : undefined,
        },
        include: { dailyTimings: true },
      });

      return updatedSchedule;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new BadRequestException('Invalid schedule data provided');
      }

      throw new InternalServerErrorException('Failed to create schedule');
    }
  }

  getDayOfWeek(date: Date) {
    return format(date, 'EEEE').toUpperCase();
  }

  getDayOfWeekDailyTiming(date: Date, dailyTimings: TSchedule['dailyTimings']) {
    const dayOfWeek = this.getDayOfWeek(date);
    return dailyTimings.find((timing) => timing.dayOfWeek === dayOfWeek);
  }

  combineDateWithScheduleTime(date: Date, dateWithTime: Date) {
    const year = getYear(date);
    const month = getMonth(date) + 1; // Months are 0-indexed in JavaScript
    const day = getDate(date);

    const hours = getHours(dateWithTime);
    const minutes = getMinutes(dateWithTime);
    const seconds = getSeconds(dateWithTime);

    const combinedDate = new Date(
      year,
      month - 1,
      day,
      hours,
      minutes,
      seconds,
    );

    return format(combinedDate, "yyyy-MM-dd'T'HH:mm:ss");
  }
  getCountOfEvents(start: Date, end: Date, eventDuration: number) {
    if (!(start instanceof Date) || !(end instanceof Date)) {
      throw new Error('Both start and end dates must be valid Date objects');
    }

    const totalSeconds = differenceInSeconds(end, start);

    if (eventDuration <= 0) {
      return 0;
    }

    // Calculate how many blocks fit
    const blocks = Math.floor(totalSeconds / eventDuration);

    return blocks;
  }

  addDurationInSeconds(date: Date, durationInSeconds: number) {
    if (!(date instanceof Date)) {
      throw new Error('Input must be a valid Date object');
    }

    const result = add(date, { seconds: durationInSeconds });

    return result;
  }

  async generateEventsForSingleDay(scheduleId: string, date: Date) {
    try {
      const schedule = await this.prisma.schedule.findUnique({
        where: { id: scheduleId },
        include: { dailyTimings: true },
      });

      if (!schedule) {
        throw new BadRequestException('Schedule not found');
      }

      const dailyTiming = this.getDayOfWeekDailyTiming(
        date,
        schedule.dailyTimings,
      );

      if (!dailyTiming) {
        throw new BadRequestException('No schedule was found for this date');
      }

      const start = this.combineDateWithScheduleTime(date, dailyTiming.start);
      const end = this.combineDateWithScheduleTime(date, dailyTiming.end);

      const count = this.getCountOfEvents(
        new Date(start),
        new Date(end),
        schedule.eventDuration,
      );

      if (count < 1) {
        throw new BadRequestException(
          'The time slot of that day is too short to create events',
        );
      }

      let currentTime = new Date(start);
      const preparedEvents = [];

      for (let i = 0; i < count; i++) {
        const singleEvent = {
          title: `DailyTiming ${dailyTiming.id} - Slot ${i + 1}`,
          start: currentTime.toISOString(),
          end: this.addDurationInSeconds(
            new Date(currentTime),
            schedule.eventDuration,
          ).toISOString(),
          isBooked: false,
        };

        preparedEvents.push(singleEvent);

        currentTime = this.addDurationInSeconds(
          currentTime,
          schedule.eventDuration,
        );
      }

      const events = await this.prisma.event.createManyAndReturn({
        data: preparedEvents,
      });

      return events;
    } catch (err) {
      throw new InternalServerErrorException(err);
    }
  }
}
