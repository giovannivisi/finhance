import { BrokerageController } from '@brokerage/brokerage.controller';
import type { BrokerageService } from '@brokerage/brokerage.service';
import type { RequestOwnerResolver } from '@/security/request-owner.resolver';

describe('BrokerageController', () => {
  const ownerId = 'owner-1';
  const accountId = 'brokerage-1';
  const operationId = 'operation-1';

  function createController() {
    const brokerageService = {
      listBrokerageAccounts: jest.fn().mockResolvedValue(['account']),
      getWorkspace: jest.fn().mockResolvedValue({ id: accountId }),
      getPerformance: jest.fn().mockResolvedValue({ range: '1D' }),
      createBuy: jest.fn().mockResolvedValue({ id: operationId, type: 'BUY' }),
      createSell: jest
        .fn()
        .mockResolvedValue({ id: operationId, type: 'SELL' }),
      createDividend: jest
        .fn()
        .mockResolvedValue({ id: operationId, type: 'DIVIDEND' }),
      createFee: jest.fn().mockResolvedValue({ id: operationId, type: 'FEE' }),
      updateTrade: jest
        .fn()
        .mockResolvedValue({ id: operationId, type: 'BUY' }),
      removeTrade: jest.fn().mockResolvedValue(undefined),
      updateAllocationTargets: jest.fn().mockResolvedValue({ targets: [] }),
    };
    const requestOwnerResolver = {
      resolveOwnerId: jest.fn(() => ownerId),
    };

    return {
      brokerageService,
      requestOwnerResolver,
      controller: new BrokerageController(
        brokerageService as unknown as BrokerageService,
        requestOwnerResolver as unknown as RequestOwnerResolver,
      ),
    };
  }

  it('delegates account reads with the resolved owner', async () => {
    const { controller, brokerageService, requestOwnerResolver } =
      createController();

    await expect(controller.list()).resolves.toEqual(['account']);
    await expect(controller.getWorkspace(accountId)).resolves.toEqual({
      id: accountId,
    });
    await expect(controller.getPerformance(accountId, {})).resolves.toEqual({
      range: '1D',
    });
    await controller.getPerformance(accountId, { range: 'MAX' });

    expect(brokerageService.listBrokerageAccounts).toHaveBeenCalledWith(
      ownerId,
    );
    expect(brokerageService.getWorkspace).toHaveBeenCalledWith(
      ownerId,
      accountId,
    );
    expect(brokerageService.getPerformance).toHaveBeenNthCalledWith(
      1,
      ownerId,
      accountId,
      '1D',
    );
    expect(brokerageService.getPerformance).toHaveBeenNthCalledWith(
      2,
      ownerId,
      accountId,
      'MAX',
    );
    expect(requestOwnerResolver.resolveOwnerId).toHaveBeenCalledTimes(4);
  });

  it('delegates each operation mutation with the account and body', async () => {
    const { controller, brokerageService } = createController();
    const buy = { assetId: 'asset-1' } as never;
    const sell = { assetId: 'asset-1' } as never;
    const dividend = { assetId: 'asset-1' } as never;
    const fee = { amount: 2 } as never;
    const update = { occurredAt: '2026-08-19T12:00:00.000Z' } as never;

    await expect(controller.createBuy(accountId, buy)).resolves.toEqual({
      id: operationId,
      type: 'BUY',
    });
    await expect(controller.createSell(accountId, sell)).resolves.toEqual({
      id: operationId,
      type: 'SELL',
    });
    await expect(
      controller.createDividend(accountId, dividend),
    ).resolves.toEqual({
      id: operationId,
      type: 'DIVIDEND',
    });
    await expect(controller.createFee(accountId, fee)).resolves.toEqual({
      id: operationId,
      type: 'FEE',
    });
    await expect(
      controller.updateTrade(accountId, operationId, update),
    ).resolves.toEqual({ id: operationId, type: 'BUY' });
    await expect(controller.removeTrade(accountId, operationId)).resolves.toBe(
      undefined,
    );

    expect(brokerageService.createBuy).toHaveBeenCalledWith(
      ownerId,
      accountId,
      buy,
    );
    expect(brokerageService.createSell).toHaveBeenCalledWith(
      ownerId,
      accountId,
      sell,
    );
    expect(brokerageService.createDividend).toHaveBeenCalledWith(
      ownerId,
      accountId,
      dividend,
    );
    expect(brokerageService.createFee).toHaveBeenCalledWith(
      ownerId,
      accountId,
      fee,
    );
    expect(brokerageService.updateTrade).toHaveBeenCalledWith(
      ownerId,
      accountId,
      operationId,
      update,
    );
    expect(brokerageService.removeTrade).toHaveBeenCalledWith(
      ownerId,
      accountId,
      operationId,
    );
  });

  it('delegates allocation target updates with the resolved owner', async () => {
    const { controller, brokerageService } = createController();
    const targets = {
      targets: [{ assetId: 'asset-1', targetPercent: 100 }],
    } as never;

    await expect(controller.updateTargets(targets)).resolves.toEqual({
      targets: [],
    });

    expect(brokerageService.updateAllocationTargets).toHaveBeenCalledWith(
      ownerId,
      targets,
    );
  });
});
