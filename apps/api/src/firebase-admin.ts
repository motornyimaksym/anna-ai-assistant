import { Injectable } from '@nestjs/common';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { loadBackendEnv } from '@booking/config';
@Injectable()
export class FirebaseAdminService {
  constructor() { if (!getApps().length) { const env = loadBackendEnv(process.env); initializeApp({ credential: applicationDefault(), ...(env.FIREBASE_PROJECT_ID ? { projectId: env.FIREBASE_PROJECT_ID } : {}) }); } }
}
