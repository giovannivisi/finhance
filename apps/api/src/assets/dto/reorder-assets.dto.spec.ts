import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  ReorderAssetKindsDto,
  ReorderAssetsDto,
} from '@assets/dto/reorder-assets.dto';

function collectConstraintNames(
  errors: ReturnType<typeof validateSync>,
): string[] {
  return errors.flatMap((error) => Object.keys(error.constraints ?? {}));
}

describe('ReorderAssetsDto', () => {
  it('accepts unique asset ids', () => {
    const dto = plainToInstance(ReorderAssetsDto, {
      assetIds: [' asset-1 ', 'asset-2'],
    });

    expect(validateSync(dto)).toEqual([]);
    expect(dto.assetIds).toEqual(['asset-1', 'asset-2']);
  });

  it('rejects duplicate or empty asset ids', () => {
    const dto = plainToInstance(ReorderAssetsDto, {
      assetIds: ['asset-1', 'asset-1', ''],
    });

    const constraintNames = collectConstraintNames(validateSync(dto));

    expect(constraintNames).toEqual(
      expect.arrayContaining(['arrayUnique', 'isNotEmpty']),
    );
  });
});

describe('ReorderAssetKindsDto', () => {
  it('accepts and normalises valid asset kinds', () => {
    const dto = plainToInstance(ReorderAssetKindsDto, {
      kindOrder: ['cash', 'STOCK'],
    });

    expect(validateSync(dto)).toEqual([]);
    expect(dto.kindOrder).toEqual(['CASH', 'STOCK']);
  });

  it('rejects unsupported asset kinds', () => {
    const dto = plainToInstance(ReorderAssetKindsDto, {
      kindOrder: ['CASH', 'NOT_A_KIND'],
    });

    expect(collectConstraintNames(validateSync(dto))).toEqual(
      expect.arrayContaining(['isEnum']),
    );
  });
});
