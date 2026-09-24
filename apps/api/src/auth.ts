import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { loadBackendRuntimeEnv } from '@booking/config';
import { FirebaseAdminService } from './firebase-admin.js';
import { BookingRepository } from './repository.js';

export type AdminPrincipal = { uid: string; email?: string; isOwner: boolean };
export type AdminRequest = { headers: Record<string, string | undefined>; admin?: AdminPrincipal };

@Injectable()
export class AdminAuthService {
  private readonly allowed = new Set(loadBackendRuntimeEnv(process.env).ADMIN_UIDS.split(',').map((uid) => uid.trim()).filter(Boolean));
  constructor(_firebase: FirebaseAdminService, private readonly repository: BookingRepository) {}
  async verify(token: string | undefined): Promise<AdminPrincipal> {
    if (!token?.startsWith('Bearer ')) throw new UnauthorizedException();
    const { getAuth } = await import('firebase-admin/auth');
    const decoded = await getAuth().verifyIdToken(token.slice(7));
    const email = typeof decoded.email === 'string' ? decoded.email.trim().toLowerCase() : undefined;
    if (this.allowed.has(decoded.uid)) return { uid: decoded.uid, ...(email ? { email } : {}), isOwner: true };
    if (!email || decoded.email_verified !== true) throw new UnauthorizedException();
    const access = await this.repository.getAdminAccessOverride();
    if (!access?.emails.includes(email)) throw new UnauthorizedException();
    return { uid: decoded.uid, email, isOwner: false };
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly auth: AdminAuthService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    request.admin = await this.auth.verify(request.headers.authorization);
    return true;
  }
}

@Injectable()
export class AdminOwnerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    if (!request.admin?.isOwner) throw new ForbiddenException('Only an admin owner can change stakeholder access');
    return true;
  }
}
