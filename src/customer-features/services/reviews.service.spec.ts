import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OrderRepository } from '@AccountsOrders/repositories';
import { BranchRepository } from '@Branches/repositories';
import {
  OrderStatus,
  UserRole,
  type Branch,
  type Order,
  type Review,
  type User,
} from '@PrismaClient';
import { CreateReviewDto } from '../dto/index.js';
import { ReviewAlreadyExistsError } from '../errors/index.js';
import { ReviewRepository } from '../repositories/index.js';
import { ReviewsService } from './reviews.service.js';

describe('ReviewsService', () => {
  const user: Pick<User, 'id' | 'role'> = { id: 'user-1', role: UserRole.CLIENT };
  const branchId = 'branch-1';
  const orderId = 'order-1';
  const dto: CreateReviewDto = {
    orderId,
    rating: 5,
    comment: 'Excelente servicio',
  };

  const order: Order = {
    id: orderId,
    branchId,
    accountId: null,
    customerId: user.id,
    waiterId: null,
    orderNumber: null,
    type: 'DINE_IN',
    recipientName: null,
    recipientPhone: null,
    deliveryAddress: null,
    deliveryReference: null,
    deliveryInstructions: null,
    total: null,
    requestHash: null,
    status: OrderStatus.DELIVERED,
    paymentMode: null,
    operationId: 'operation-1',
    pickupAt: null,
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
  } as Order;

  const branch: Branch = {
    id: branchId,
    name: 'Sucursal A',
    address: 'Calle principal',
    timeZone: 'America/El_Salvador',
    isActive: true,
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
  } as Branch;

  const review: Review = {
    id: 'review-1',
    orderId,
    customerId: user.id,
    branchId,
    rating: dto.rating,
    comment: dto.comment,
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
  } as Review;

  const orderRepository = {
    findById: vi.fn<() => Promise<Order | null>>(),
  };
  const branchRepository = {
    findById: vi.fn<() => Promise<Branch | null>>(),
  };
  const reviewRepository = {
    create: vi.fn<() => Promise<Review>>(),
    aggregateByBranch: vi.fn<
      () => Promise<{ _avg: { rating: number | null }; _count: { _all: number } }>
    >(),
  };

  let service: ReviewsService;

  beforeEach(async () => {
    vi.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: OrderRepository, useValue: orderRepository },
        { provide: BranchRepository, useValue: branchRepository },
        { provide: ReviewRepository, useValue: reviewRepository },
      ],
    }).compile();
    service = module.get(ReviewsService);
  });

  it('403 si el usuario no es cliente', async () => {
    await expect(
      service.create({ ...user, role: UserRole.WAITER }, dto),
    ).rejects.toThrow(ForbiddenException);
    expect(orderRepository.findById).not.toHaveBeenCalled();
  });

  it('404 si el pedido no existe', async () => {
    orderRepository.findById.mockResolvedValue(null);
    await expect(service.create(user, dto)).rejects.toThrow(NotFoundException);
    expect(reviewRepository.create).not.toHaveBeenCalled();
  });

  it('403 si el pedido no pertenece al usuario', async () => {
    orderRepository.findById.mockResolvedValue({ ...order, customerId: 'other-user' });
    await expect(service.create(user, dto)).rejects.toThrow(ForbiddenException);
    expect(reviewRepository.create).not.toHaveBeenCalled();
  });

  it('409 si el pedido no está entregado', async () => {
    orderRepository.findById.mockResolvedValue({ ...order, status: OrderStatus.PENDING });
    await expect(service.create(user, dto)).rejects.toThrow(ConflictException);
    expect(reviewRepository.create).not.toHaveBeenCalled();
  });

  it('crea la reseña con branchId y customerId del pedido y del usuario', async () => {
    orderRepository.findById.mockResolvedValue(order);
    branchRepository.findById.mockResolvedValue(branch);
    reviewRepository.create.mockResolvedValue(review);
    reviewRepository.aggregateByBranch.mockResolvedValue({
      _avg: { rating: 4.5 },
      _count: { _all: 3 },
    });

    await expect(service.create(user, dto)).resolves.toEqual({
      review,
      branchRating: { average: 4.5, count: 3 },
    });
    expect(reviewRepository.create).toHaveBeenCalledWith({
      orderId,
      customerId: user.id,
      branchId,
      rating: dto.rating,
      comment: dto.comment,
    });
  });

  it('409 si el pedido ya tiene una reseña', async () => {
    orderRepository.findById.mockResolvedValue(order);
    reviewRepository.create.mockRejectedValue(new ReviewAlreadyExistsError(orderId));

    await expect(service.create(user, dto)).rejects.toThrow(ConflictException);
  });

  it('getBranchRating devuelve promedio y cantidad', async () => {
    branchRepository.findById.mockResolvedValue(branch);
    reviewRepository.aggregateByBranch.mockResolvedValue({
      _avg: { rating: 4.5 },
      _count: { _all: 3 },
    });

    await expect(service.getBranchRating(branchId)).resolves.toEqual({
      average: 4.5,
      count: 3,
    });
  });

  it('404 si la sucursal no existe al consultar rating', async () => {
    branchRepository.findById.mockResolvedValue(null);
    await expect(service.getBranchRating(branchId)).rejects.toThrow(NotFoundException);
    expect(reviewRepository.aggregateByBranch).not.toHaveBeenCalled();
  });
});
