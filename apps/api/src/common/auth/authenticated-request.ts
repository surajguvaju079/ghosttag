import { Request } from "express";

export interface AuthenticatedIdentity {
  id: string;
}

export type AuthenticatedRequest = Request & {
  identity: AuthenticatedIdentity
}
