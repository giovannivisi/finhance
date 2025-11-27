import { PartialType } from '@nestjs/mapped-types';
import { CreateAssetDto } from '@assets/dto/create-asset.dto';

export class UpdateAssetDto extends PartialType(CreateAssetDto) {}