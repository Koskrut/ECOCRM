import { OrderKanbanGroup, OrderStage } from "@prisma/client";
import { Type } from "class-transformer";
import { ArrayNotEmpty, IsArray, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from "class-validator";

export class PutOrderPipelineStageDto {
  @IsEnum(OrderStage)
  stage!: OrderStage;

  @IsInt()
  @Min(0)
  @Max(11)
  sortOrder!: number;

  @IsString()
  @MaxLength(200)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  color?: string | null;

  @IsEnum(OrderKanbanGroup)
  kanbanGroup!: OrderKanbanGroup;

  @IsArray()
  @IsEnum(OrderStage, { each: true })
  allowedNext!: OrderStage[];
}

export class PutOrderPipelineDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PutOrderPipelineStageDto)
  stages!: PutOrderPipelineStageDto[];
}
