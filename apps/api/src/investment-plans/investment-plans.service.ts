import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountType,
  AssetKind,
  InvestmentPlanCadence,
  InvestmentPlanOccurrenceStatus,
  Prisma,
} from '@finhance/db';
import { BrokerageService } from '@brokerage/brokerage.service';
import { CreateInvestmentPlanDto } from '@investment-plans/dto/create-investment-plan.dto';
import { RecordInvestmentPlanBuyDto } from '@investment-plans/dto/record-investment-plan-buy.dto';
import { UpdateInvestmentPlanDto } from '@investment-plans/dto/update-investment-plan.dto';
import { PrismaService } from '@prisma/prisma.service';
import {
  isSupportedCurrencyCode,
  isSupportedExchangeValue,
} from '@/common/catalogues';

const ZERO = new Prisma.Decimal(0);
const MARKET_KINDS = new Set<AssetKind>([
  AssetKind.STOCK,
  AssetKind.BOND,
  AssetKind.CRYPTO,
]);
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ROME_DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const PLAN_INCLUDE = {
  account: {
    select: {
      id: true,
      name: true,
      currency: true,
    },
  },
} as const;

type PlanClient = PrismaService | Prisma.TransactionClient;
type Schedule = {
  cadence: InvestmentPlanCadence;
  dayOfMonth: number;
  secondDayOfMonth: number | null;
};

@Injectable()
export class InvestmentPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brokerageService: BrokerageService,
  ) {}

  async findAll(ownerId: string) {
    return this.prisma.investmentPlan.findMany({
      where: { userId: ownerId },
      include: PLAN_INCLUDE,
      orderBy: [
        { isActive: 'desc' },
        { nextScheduledDate: 'asc' },
        { createdAt: 'asc' },
      ],
    });
  }

  async findOne(ownerId: string, id: string) {
    return this.findRequiredPlan(ownerId, id, this.prisma);
  }

  async create(ownerId: string, dto: CreateInvestmentPlanDto) {
    const prepared = await this.preparePlanInput(ownerId, dto, this.prisma);

    return this.prisma.investmentPlan.create({
      data: prepared,
      include: PLAN_INCLUDE,
    });
  }

  async update(ownerId: string, id: string, dto: UpdateInvestmentPlanDto) {
    await this.findRequiredPlan(ownerId, id, this.prisma);
    const prepared = await this.preparePlanInput(ownerId, dto, this.prisma);

    return this.prisma.investmentPlan.update({
      where: { id },
      data: prepared,
      include: PLAN_INCLUDE,
    });
  }

  async pause(ownerId: string, id: string) {
    await this.findRequiredPlan(ownerId, id, this.prisma);
    return this.prisma.investmentPlan.update({
      where: { id },
      data: { isActive: false },
      include: PLAN_INCLUDE,
    });
  }

  async resume(ownerId: string, id: string) {
    await this.findRequiredPlan(ownerId, id, this.prisma);
    return this.prisma.investmentPlan.update({
      where: { id },
      data: { isActive: true },
      include: PLAN_INCLUDE,
    });
  }

  async skip(ownerId: string, id: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const plan = await this.findRequiredPlan(ownerId, id, tx);
        this.assertPlanDue(plan);
        const nextScheduledDate = this.nextScheduledDate(plan);

        await tx.investmentPlanOccurrence.create({
          data: {
            userId: ownerId,
            investmentPlanId: plan.id,
            scheduledFor: plan.nextScheduledDate,
            status: InvestmentPlanOccurrenceStatus.SKIPPED,
          },
        });

        return tx.investmentPlan.update({
          where: { id: plan.id },
          data: { nextScheduledDate },
          include: PLAN_INCLUDE,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async recordBuy(
    ownerId: string,
    id: string,
    dto: RecordInvestmentPlanBuyDto,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const plan = await this.findRequiredPlan(ownerId, id, tx);
        this.assertPlanDue(plan);

        const operation = await this.brokerageService.createBuyInTransaction(
          ownerId,
          plan.accountId,
          {
            name: plan.securityName,
            kind: plan.securityKind,
            ticker: plan.securityTicker,
            exchange: plan.securityExchange,
            currency: plan.currency,
            quantity: dto.quantity,
            unitPrice: dto.unitPrice,
            feeAmount: dto.feeAmount,
            postedAt: dto.postedAt,
            notes: dto.notes,
          },
          tx,
        );
        const nextScheduledDate = this.nextScheduledDate(plan);

        await tx.investmentPlanOccurrence.create({
          data: {
            userId: ownerId,
            investmentPlanId: plan.id,
            scheduledFor: plan.nextScheduledDate,
            status: InvestmentPlanOccurrenceStatus.COMPLETED,
            brokerageOperationId: operation.id,
          },
        });

        const updatedPlan = await tx.investmentPlan.update({
          where: { id: plan.id },
          data: { nextScheduledDate },
          include: PLAN_INCLUDE,
        });

        return { plan: updatedPlan, operation };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async findRequiredPlan(
    ownerId: string,
    id: string,
    client: PlanClient,
  ) {
    const plan = await client.investmentPlan.findFirst({
      where: { id, userId: ownerId },
      include: PLAN_INCLUDE,
    });

    if (!plan) {
      throw new NotFoundException(`Investment plan ${id} was not found.`);
    }

    return plan;
  }

  private async preparePlanInput(
    ownerId: string,
    dto: CreateInvestmentPlanDto | UpdateInvestmentPlanDto,
    client: PlanClient,
  ) {
    await this.requireBrokerageAccount(ownerId, dto.accountId, client);

    const schedule = this.validateSchedule({
      cadence: dto.cadence,
      dayOfMonth: dto.dayOfMonth,
      secondDayOfMonth: dto.secondDayOfMonth ?? null,
    });
    const nextScheduledDate = this.dateKeyToValue(dto.nextScheduledDate);

    return {
      userId: ownerId,
      accountId: dto.accountId,
      name: this.requireText(dto.name, 'Plan name is required.'),
      securityName: this.requireText(
        dto.securityName,
        'Security name is required.',
      ),
      securityKind: this.requireMarketKind(dto.securityKind),
      securityTicker: this.normalizeTicker(dto.securityTicker),
      securityExchange: this.normalizeExchange(
        dto.securityKind,
        dto.securityExchange ?? null,
      ),
      currency: this.normalizeCurrency(dto.currency),
      contributionAmount: this.toPositiveDecimal(
        dto.contributionAmount,
        'Contribution amount must be positive.',
      ),
      estimatedFeeAmount: this.toOptionalNonNegativeDecimal(
        dto.estimatedFeeAmount,
        'Estimated fee cannot be negative.',
      ),
      cadence: schedule.cadence,
      dayOfMonth: schedule.dayOfMonth,
      secondDayOfMonth: schedule.secondDayOfMonth,
      nextScheduledDate,
      notes: this.optionalText(dto.notes),
    };
  }

  private async requireBrokerageAccount(
    ownerId: string,
    accountId: string,
    client: PlanClient,
  ): Promise<void> {
    const account = await client.account.findFirst({
      where: {
        id: accountId,
        userId: ownerId,
        type: AccountType.BROKER,
        archivedAt: null,
      },
      select: { id: true },
    });

    if (!account) {
      throw new NotFoundException(
        `Brokerage account ${accountId} was not found.`,
      );
    }
  }

  private assertPlanDue(plan: {
    isActive: boolean;
    nextScheduledDate: Date;
  }): void {
    if (!plan.isActive) {
      throw new ConflictException(
        'Investment plan is paused. Resume it before recording or skipping an instalment.',
      );
    }

    if (this.dateKey(plan.nextScheduledDate) > this.currentRomeDateKey()) {
      throw new ConflictException('This investment plan is not due yet.');
    }
  }

  private validateSchedule(schedule: Schedule): Schedule {
    if (schedule.cadence === InvestmentPlanCadence.MONTHLY) {
      if (schedule.secondDayOfMonth !== null) {
        throw new BadRequestException(
          'Monthly plans cannot specify a second schedule day.',
        );
      }
      return schedule;
    }

    if (schedule.cadence !== InvestmentPlanCadence.TWICE_MONTHLY) {
      throw new BadRequestException('Unsupported investment plan cadence.');
    }

    if (schedule.secondDayOfMonth === null) {
      throw new BadRequestException(
        'Twice-monthly plans require a second schedule day.',
      );
    }

    if (schedule.dayOfMonth === schedule.secondDayOfMonth) {
      throw new BadRequestException(
        'Twice-monthly plans must use two different schedule days.',
      );
    }

    return schedule;
  }

  private nextScheduledDate(plan: {
    cadence: InvestmentPlanCadence;
    dayOfMonth: number;
    secondDayOfMonth: number | null;
    nextScheduledDate: Date;
  }): Date {
    const schedule = this.validateSchedule({
      cadence: plan.cadence,
      dayOfMonth: plan.dayOfMonth,
      secondDayOfMonth: plan.secondDayOfMonth,
    });
    const currentDateKey = this.dateKey(plan.nextScheduledDate);
    let monthKey = currentDateKey.slice(0, 7);

    for (let offset = 0; offset < 24; offset += 1) {
      const next = this.scheduleDatesForMonth(schedule, monthKey).find(
        (candidate) => candidate > currentDateKey,
      );
      if (next) {
        return this.dateKeyToValue(next);
      }
      monthKey = this.incrementMonthKey(monthKey);
    }

    throw new BadRequestException(
      'Unable to calculate the next scheduled date.',
    );
  }

  private scheduleDatesForMonth(
    schedule: Schedule,
    monthKey: string,
  ): string[] {
    const [year, month] = monthKey.split('-').map(Number);
    const lastDay = this.daysInMonth(year, month);
    const days = [schedule.dayOfMonth];
    if (schedule.secondDayOfMonth !== null) {
      days.push(schedule.secondDayOfMonth);
    }

    return Array.from(new Set(days.map((day) => Math.min(day, lastDay))))
      .sort((left, right) => left - right)
      .map((day) => `${monthKey}-${String(day).padStart(2, '0')}`);
  }

  private incrementMonthKey(monthKey: string): string {
    const [year, month] = monthKey.split('-').map(Number);
    const next = new Date(Date.UTC(year, month, 1));
    return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private daysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  private currentRomeDateKey(now = new Date()): string {
    const parts = ROME_DATE_FORMATTER.formatToParts(now);
    const values = new Map(parts.map((part) => [part.type, part.value]));
    return `${values.get('year')}-${values.get('month')}-${values.get('day')}`;
  }

  private dateKey(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private dateKeyToValue(dateKey: string): Date {
    if (!DATE_KEY_PATTERN.test(dateKey)) {
      throw new BadRequestException('Dates must use the YYYY-MM-DD format.');
    }

    const [year, month, day] = dateKey.split('-').map(Number);
    const value = new Date(Date.UTC(year, month - 1, day, 12));
    if (this.dateKey(value) !== dateKey) {
      throw new BadRequestException('Date is invalid.');
    }

    return value;
  }

  private requireMarketKind(kind: AssetKind): AssetKind {
    if (!MARKET_KINDS.has(kind)) {
      throw new BadRequestException(
        'Investment plans only support market security kinds.',
      );
    }
    return kind;
  }

  private normalizeTicker(ticker: string): string {
    const normalized = ticker.trim().toUpperCase();
    if (!normalized) {
      throw new BadRequestException('Security ticker is required.');
    }
    return normalized;
  }

  private normalizeExchange(kind: AssetKind, exchange: string | null): string {
    const normalized = (exchange ?? '').trim().toUpperCase();
    if (kind === AssetKind.CRYPTO) {
      return '_CRYPTO_';
    }
    if (normalized === '_CRYPTO_') {
      throw new BadRequestException(
        'Only crypto securities may use the crypto exchange sentinel.',
      );
    }
    if (!isSupportedExchangeValue(normalized, kind)) {
      throw new BadRequestException('Unsupported exchange.');
    }
    return normalized;
  }

  private normalizeCurrency(currency: string): string {
    const normalized = currency.trim().toUpperCase();
    if (!isSupportedCurrencyCode(normalized)) {
      throw new BadRequestException(`Unsupported currency code "${currency}".`);
    }
    return normalized;
  }

  private requireText(value: string, message: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new BadRequestException(message);
    }
    return trimmed;
  }

  private optionalText(value: string | null | undefined): string | null {
    return value?.trim() || null;
  }

  private toPositiveDecimal(value: number, message: string): Prisma.Decimal {
    const decimal = new Prisma.Decimal(value);
    if (!decimal.gt(ZERO)) {
      throw new BadRequestException(message);
    }
    return decimal;
  }

  private toOptionalNonNegativeDecimal(
    value: number | null | undefined,
    message: string,
  ): Prisma.Decimal | null {
    if (value == null) {
      return null;
    }
    const decimal = new Prisma.Decimal(value);
    if (decimal.lt(ZERO)) {
      throw new BadRequestException(message);
    }
    return decimal;
  }
}
