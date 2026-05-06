import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export const ACTIVITIES_LIST_DEFAULT_LIMIT = 100;
export const ACTIVITIES_LIST_MAX_LIMIT = 200;

/**
 * Cursor pagination for activities lists.
 * Cursor is the activity id of the last item from the previous page.
 */
export class ListActivitiesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ACTIVITIES_LIST_MAX_LIMIT)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}
