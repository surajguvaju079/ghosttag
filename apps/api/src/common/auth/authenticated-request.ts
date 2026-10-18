import { Request } from 'express';

export interface AuthenticatedIdentity {
  id: string;
}

export type AuthenticatedRequest = Request & {
  credentialHash: string;
  identity: AuthenticatedIdentity;
};
