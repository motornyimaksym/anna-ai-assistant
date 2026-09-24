import { Injectable } from '@nestjs/common';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { loadBackendRuntimeEnv } from '@booking/config';
@Injectable()
export class FirebaseAdminService {
  constructor() { if (!getApps().length) { const env = loadBackendRuntimeEnv(process.env); let storageBucket: string | undefined; try { storageBucket = (JSON.parse(process.env.FIREBASE_CONFIG ?? '{}') as { storageBucket?: string }).storageBucket; } catch { storageBucket = undefined; } initializeApp({ credential: applicationDefault(), ...(env.FIREBASE_PROJECT_ID ? { projectId: env.FIREBASE_PROJECT_ID } : {}), ...(storageBucket ? { storageBucket } : {}) }); } }
}
