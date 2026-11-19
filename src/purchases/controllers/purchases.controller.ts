import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import { PageQueryDto } from '../../common/dto/page-query.dto.js';
import { CreatePurchaseDto, PurchaseResponseDto, PurchasesPageDto } from '../dto/purchase.dto.js';
import { InventoryItemResponseDto } from '../../inventory/stock/dto/inventory-item-response.dto.js';
import { PurchasesService } from '../services/purchases.service.js';

@ApiBearerAuth()
@ApiTags('purchases')
@Controller('purchases')
export class PurchasesController {
  constructor(@Inject(PurchasesService) private readonly purchases: PurchasesService) {}

  @Get('low-stock')
  @ApiOkResponse({ type: [InventoryItemResponseDto] })
  lowStock(@CurrentUser() actor: User) {
    return this.purchases.lowStock(actor);
  }

  @Get()
  @ApiOkResponse({ type: PurchasesPageDto })
  list(@CurrentUser() actor: User, @Query() page: PageQueryDto) {
    return this.purchases.list(actor, page);
  }

  @Post()
  @ApiCreatedResponse({ type: PurchaseResponseDto })
  create(@CurrentUser() actor: User, @Body() input: CreatePurchaseDto) {
    return this.purchases.create(actor, input);
  }
}
