import { OrdersModule } from './orders/orders.module.js';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '@Auth';
import { JwtAuthGuard } from '@Auth/guards';
import { HealthModule } from '@Health';
import { PrismaModule } from '@Prisma';
import { UsersModule } from '@Users';
import { validateEnv } from '@Config';
import { BranchesModule } from '@Branches';
import {DiningTablesModule} from '@DiningTables';
import {CatalogModule} from '@Catalog';
import { InventoryModule } from '@Inventory';
import {RecipesModule} from '@Recipes';
import {AccountsOrdersModule} from '@AccountsOrders';
import {ReservationsModule} from '@Reservations';
import {PurchasesModule} from '@Purchase';
import {PaymentsModule} from '@Payments';
import { CustomerFeaturesModule } from '@CustomerFeatures';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Si falta DATABASE_URL o JWT_SECRET, la app no arranca.
      validate: validateEnv,
    }),
    PrismaModule,
    HealthModule,
    UsersModule,
    AuthModule,
    BranchesModule,
    DiningTablesModule,
    CatalogModule,
    InventoryModule,
    AccountsOrdersModule,
    OrdersModule,
    ReservationsModule,
    PurchasesModule,
    RecipesModule,
    PaymentsModule,
    CustomerFeaturesModule,
  ],
  providers: [
    {
      // Todo cerrado por defecto: las rutas públicas se abren con @Public().
      provide: APP_GUARD,
      useExisting: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
