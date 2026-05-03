import { createCatchAllProxy } from "@/lib/api/catchAllBackendProxy";

const handlers = createCatchAllProxy("rbac");

export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
export const PUT = handlers.PUT;
export const DELETE = handlers.DELETE;
