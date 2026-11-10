import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { BranchRepository } from '../repositories/branch.repository.js';
import type { BranchResponseDto } from '../dto/branch-response.dto.js';

interface PublicBranch {
  id: string;
  name: string;
  address: string;
  timeZone: string;
  isActive: boolean;
  config: { isOpen: boolean } | null;
}

@Injectable()
export class BranchesQueryService {
  constructor(
    @Inject(BranchRepository) private readonly repository: BranchRepository,
  ) {}

  async list(): Promise<BranchResponseDto[]> {
    return (await this.repository.findPublicBranches()).map(toResponse);
  }

  async find(id: string): Promise<BranchResponseDto> {
    const branch = await this.repository.findPublicBranch(id);
    if (!branch) throw new NotFoundException('La sucursal no existe.');
    return toResponse(branch);
  }
}

function toResponse(branch: PublicBranch): BranchResponseDto {
  return {
    id: branch.id,
    name: branch.name,
    address: branch.address,
    timeZone: branch.timeZone,
    isActive: branch.isActive,
    isOpen: branch.isActive && (branch.config?.isOpen ?? false),
  };
}
