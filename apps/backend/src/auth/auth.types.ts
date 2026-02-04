import { UserRole } from "@prisma/client";

export type JwtPayload = {
  sub: string;
  email: string;
  role: UserRole;
  fullName: string;
};

export type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
  fullName: string;
};
