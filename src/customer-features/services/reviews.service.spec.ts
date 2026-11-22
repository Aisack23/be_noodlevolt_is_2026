import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { OrderStatus, UserRole, type Order, type Review } from '@PrismaClient';
import { ReviewAlreadyExistsError } from '../errors/index.js';
import { ReviewsService } from './reviews.service.js';
describe('HU-08: reseñas de pedidos', () => {
  const user = { id: 'user-1', role: UserRole.CLIENT };
  const branchId = 'branch-1';
  const orderId = 'order-1';
  const deliveredOrder = {
    id: orderId,
    branchId,
    customerId: user.id,
    status: OrderStatus.DELIVERED,
  } as Order;
  it('HU-08-AC1: pedido propio ENTREGADO sin reseña y puntuación válida guarda la reseña asociada', async () => {
    const createdReview = {
      id: 'review-1',
      orderId,
      customerId: user.id,
      branchId,
      rating: 5,
      comment: 'Excelente servicio',
    } as Review;
    const orderRepository = {
      findById: vi.fn().mockResolvedValue(deliveredOrder),
    };
    const reviewRepository = {
      create: vi.fn().mockResolvedValue(createdReview),
      aggregateByBranch: vi.fn().mockResolvedValue({
        _avg: { rating: 5 },
        _count: { _all: 1 },
      }),
    };
    const branchRepository = {
      findById: vi.fn().mockResolvedValue({ id: branchId }),
    };
    const service = new ReviewsService(
      orderRepository as never,
      branchRepository as never,
      reviewRepository as never,
    );
    await expect(service.create(user, {
      orderId,
      rating: 5,
      comment: 'Excelente servicio',
    })).resolves.toEqual({
      review: createdReview,
      branchRating: { average: 5, count: 1 },
    });
    expect(reviewRepository.create).toHaveBeenCalledWith({
      orderId,
      customerId: user.id,
      branchId,
      rating: 5,
      comment: 'Excelente servicio',
    });
  });
  it('HU-08-AC2: pedido PENDIENTE rechaza la reseña', async () => {
    const orderRepository = {
      findById: vi.fn().mockResolvedValue({
        ...deliveredOrder,
        status: OrderStatus.PENDING,
      }),
    };
    const reviewRepository = {
      create: vi.fn(),
      aggregateByBranch: vi.fn(),
    };
    const service = new ReviewsService(
      orderRepository as never,
      { findById: vi.fn() } as never,
      reviewRepository as never,
    );
    await expect(service.create(user, { orderId, rating: 4 })).rejects.toMatchObject({
      status: 409,
    });
    expect(reviewRepository.create).not.toHaveBeenCalled();
  });
  it('HU-08-AC3: pedido con reseña rechaza con conflicto y conserva la reseña original', async () => {
    const originalReview = {
      id: 'review-original',
      orderId,
      customerId: user.id,
      branchId,
      rating: 3,
      comment: 'Original',
    } as Review;
    const persistedReview = { ...originalReview };
    const orderRepository = {
      findById: vi.fn().mockResolvedValue(deliveredOrder),
    };
    const reviewRepository = {
      create: vi.fn().mockRejectedValue(new ReviewAlreadyExistsError(orderId)),
      aggregateByBranch: vi.fn(),
    };
    const service = new ReviewsService(
      orderRepository as never,
      { findById: vi.fn() } as never,
      reviewRepository as never,
    );
    await expect(service.create(user, { orderId, rating: 1, comment: 'Intento nuevo' }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(persistedReview).toEqual(originalReview);
  });
});
