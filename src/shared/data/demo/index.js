// The demo backend: same function names as the Supabase backend (see ../supabase/index.js).
import * as admin from './admin';
import * as auth from './auth';
import * as files from './files';
import * as guides from './guides';
import * as offers from './offers';
import * as payments from './payments';
import * as proofs from './proofs';
import * as publicApi from './public';
import * as recruiter from './recruiter';
import * as settings from './settings';
import * as trust from './trust';
import { resetState } from './store';

export const demoApi = {
  ...auth,
  ...publicApi,
  ...files,
  ...recruiter,
  ...admin,
  ...offers,
  ...trust,
  ...settings,
  ...guides,
  ...payments,
  ...proofs,
  /** For the "Start again" button in the demo banner. */
  async resetDemo() {
    resetState();
  },
};
