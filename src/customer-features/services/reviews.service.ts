import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderRepository } from '@AccountsOrders/repositories';
import { BranchRepository } from '@Branches/repositories';
import { OrderStatus, type Review, type User, UserRole } from '@PrismaClient';
import { CreateReviewDto } from '../dto/index.js';
import { ReviewAlreadyExistsError } from '../errors/index.js';
import { ReviewRepository } from '../repositories/index.js';

type ReviewActor = Pick<User, 'id' | 'role'>;

@Injectable()
export class ReviewsService {
  constructor(
    @Inject(OrderRepository) private readonly orderRepository: OrderRepository,
    @Inject(BranchRepository)
    private readonly branchRepository: BranchRepository,
    @Inject(ReviewRepository)
    private readonly reviewRepository: ReviewRepository,
  ) {}

  async create(
    user: ReviewActor,
    dto: CreateReviewDto,
  ): Promise<{
    review: Review;
    branchRating: { average: number | null; count: number };
  }> {
    if (user.role !== UserRole.CLIENT) {
      throw new ForbiddenException('Solo los clientes pueden crear reseñas.');
    }

    const order = await this.orderRepository.findById(dto.orderId);
    if (!order) throw new NotFoundException('El pedido no existe.');
    if (order.customerId !== user.id)
      throw new ForbiddenException('El pedido no pertenece al cliente.');
    if (order.status !== OrderStatus.DELIVERED)
      throw new ConflictException('El pedido debe estar entregado para reseñarse.');

    try {
      const review = await this.reviewRepository.create({
        orderId: dto.orderId,
        customerId: user.id,
        branchId: order.branchId,
        rating: dto.rating,
        comment: dto.comment ?? null,
      });
      const branchRating = await this.getBranchRating(order.branchId);
      return { review, branchRating };
    } catch (error) {
      if (error instanceof ReviewAlreadyExistsError)
        throw new ConflictException('Ya existe una reseña para este pedido.');
      throw error;
    }
  }

  async getBranchRating(
    branchId: string,
  ): Promise<{ average: number | null; count: number }> {
    const branch = await this.branchRepository.findById(branchId);
    if (!branch) throw new NotFoundException('La sucursal no existe.');

    const aggregate = await this.reviewRepository.aggregateByBranch(branchId);
    return {
      average: aggregate._avg.rating ?? null,
      count: aggregate._count._all,
    };
  }
}
