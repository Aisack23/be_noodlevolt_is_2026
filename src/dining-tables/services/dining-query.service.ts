import { PageQueryDto } from '../../common/dto/page-query.dto.js';
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { User } from '@PrismaClient';
import { DiningQueryRepository } from '../repositories/dining-query.repository.js';
import type { DiningTablesQueryDto } from '../dto/dining-query.dto.js';

type DiningActor = Pick<User, 'role' | 'branchId'>;
const roles = new Set<string>([
  'WAITER',
  'COOK',
  'CASHIER',
  'BRANCH_ADMIN',
  'GENERAL_MANAGER',
]);

@Injectable()
export class DiningQueryService {
  constructor(
    @Inject(DiningQueryRepository)
    private readonly repository: DiningQueryRepository,
  ) {}

  async rooms(actor: DiningActor, branchId: string, query: PageQueryDto) {
    await this.requireBranch(actor, branchId);
    return this.repository.rooms(branchId, query);
  }

  async tables(
    actor: DiningActor,
    branchId: string,
    query: DiningTablesQueryDto,
  ) {
    await this.requireBranch(actor, branchId);
    if (
      query.roomId &&
      !(await this.repository.findRoom(branchId, query.roomId))
    ) {
      throw new NotFoundException('El salón no existe en esta sucursal.');
    }
    return this.repository.tables(branchId, query);
  }

  async table(actor: DiningActor, branchId: string, id: string) {
    await this.requireBranch(actor, branchId);
    const table = await this.repository.table(branchId, id);
    if (!table)
      throw new NotFoundException('La mesa no existe en esta sucursal.');
    return table;
  }

  private async requireBranch(actor: DiningActor, branchId: string) {
    if (
      !roles.has(actor.role) ||
      (actor.role !== 'GENERAL_MANAGER' &&
        actor.branchId?.toLowerCase() !== branchId.toLowerCase())
    ) {
      throw new ForbiddenException(
        'Se requiere personal autorizado de la sucursal.',
      );
    }
    const branch = await this.repository.findBranch(branchId);
    if (!branch?.isActive)
      throw new NotFoundException('La sucursal no está disponible.');
  }
}
