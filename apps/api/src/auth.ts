import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { loadBackendEnv } from '@booking/config';
import { FirebaseAdminService } from './firebase-admin.js';
@Injectable()
export class AdminAuthService {
  private readonly allowed = new Set(loadBackendEnv(process.env).ADMIN_UIDS.split(',').map((uid) => uid.trim()).filter(Boolean));
  constructor(_firebase: FirebaseAdminService) {}
  async verify(token: string | undefined): Promise<string> {
    if (!token?.startsWith('Bearer ')) throw new UnauthorizedException();
    const { getAuth } = await import('firebase-admin/auth');
    const decoded = await getAuth().verifyIdToken(token.slice(7));
    if (!this.allowed.has(decoded.uid)) throw new UnauthorizedException();
    return decoded.uid;
  }
}
@Injectable()
export class AdminGuard implements CanActivate { constructor(private readonly auth: AdminAuthService) {} async canActivate(context: ExecutionContext): Promise<boolean> { const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>(); await this.auth.verify(request.headers.authorization); return true; } }
