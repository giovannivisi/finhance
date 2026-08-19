import { AssetsController } from '@assets/assets.controller';
import type { AssetsService } from '@assets/assets.service';
import type { RequestOwnerResolver } from '@/security/request-owner.resolver';

describe('AssetsController', () => {
  const ownerId = 'owner-1';
  const assetId = 'asset-1';
  const asset = {
    id: assetId,
    name: 'World ETF',
    type: 'STOCK',
    accountId: 'account-1',
    kind: 'MARKET',
    liabilityKind: null,
    ticker: 'VWCE',
    exchange: 'XETRA',
    quantity: null,
    unitPrice: null,
    balance: null,
    currency: 'EUR',
    notes: null,
    order: 0,
    lastPrice: null,
    lastPriceAt: null,
    lastFxRate: null,
    lastFxRateAt: null,
  };

  function createController() {
    const assetsService = {
      findAll: jest.fn().mockResolvedValue([asset]),
      findAllWithCurrentValue: jest.fn().mockResolvedValue([{ id: assetId }]),
      getSummary: jest.fn().mockResolvedValue({ totalValue: 123 }),
      getLiveValuations: jest.fn().mockResolvedValue({ values: [] }),
      refreshAssets: jest.fn().mockResolvedValue({ refreshed: 1 }),
      create: jest.fn().mockResolvedValue(asset),
      findOne: jest.fn().mockResolvedValue(asset),
      update: jest.fn().mockResolvedValue(asset),
      reorderAssets: jest.fn().mockResolvedValue(undefined),
      reorderAssetKinds: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const requestOwnerResolver = {
      resolveOwnerId: jest.fn(() => ownerId),
    };

    return {
      assetsService,
      controller: new AssetsController(
        assetsService as unknown as AssetsService,
        requestOwnerResolver as unknown as RequestOwnerResolver,
      ),
    };
  }

  it('maps persisted assets and delegates asset reads', async () => {
    const { controller, assetsService } = createController();

    await expect(controller.findAll()).resolves.toEqual([
      expect.objectContaining({ id: assetId, balance: 0 }),
    ]);
    await expect(controller.findOne(assetId)).resolves.toEqual(
      expect.objectContaining({ id: assetId, balance: 0 }),
    );
    await expect(controller.findAllWithValues()).resolves.toEqual([
      { id: assetId },
    ]);
    await expect(controller.getSummary()).resolves.toEqual({ totalValue: 123 });
    await expect(controller.getLiveValuations()).resolves.toEqual({
      values: [],
    });
    await expect(controller.refreshAssets()).resolves.toEqual({ refreshed: 1 });

    expect(assetsService.findAll).toHaveBeenCalledWith(ownerId);
    expect(assetsService.findOne).toHaveBeenCalledWith(ownerId, assetId);
    expect(assetsService.findAllWithCurrentValue).toHaveBeenCalledWith(ownerId);
    expect(assetsService.getSummary).toHaveBeenCalledWith(ownerId);
    expect(assetsService.getLiveValuations).toHaveBeenCalledWith(ownerId);
    expect(assetsService.refreshAssets).toHaveBeenCalledWith(ownerId);
  });

  it('maps writes and forwards reordering and deletion requests', async () => {
    const { controller, assetsService } = createController();
    const create = { name: 'World ETF' } as never;
    const update = { name: 'Global ETF' } as never;

    await expect(controller.create(create)).resolves.toEqual(
      expect.objectContaining({ id: assetId }),
    );
    await expect(controller.update(assetId, update)).resolves.toEqual(
      expect.objectContaining({ id: assetId }),
    );
    await expect(
      controller.reorderAssets({ assetIds: ['asset-2', assetId] }),
    ).resolves.toBeUndefined();
    await expect(
      controller.reorderKinds({ kindOrder: ['MARKET'] }),
    ).resolves.toBeUndefined();
    await expect(controller.remove(assetId)).resolves.toBeUndefined();

    expect(assetsService.create).toHaveBeenCalledWith(ownerId, create);
    expect(assetsService.update).toHaveBeenCalledWith(ownerId, assetId, update);
    expect(assetsService.reorderAssets).toHaveBeenCalledWith(ownerId, [
      'asset-2',
      assetId,
    ]);
    expect(assetsService.reorderAssetKinds).toHaveBeenCalledWith(ownerId, [
      'MARKET',
    ]);
    expect(assetsService.remove).toHaveBeenCalledWith(ownerId, assetId);
  });
});
