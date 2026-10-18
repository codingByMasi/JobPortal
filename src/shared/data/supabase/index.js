// The Supabase backend: same function names as the demo backend (see ../demo/index.js).
import * as admin from './admin';
import * as auth from './auth';
import * as files from './files';
import * as guides from './guides';
import * as offers from './offers';
import * as proofs from './proofs';
import * as publicApi from './public';
import * as recruiter from './recruiter';
import * as settings from './settings';
import * as trust from './trust';

export const supabaseApi = { ...auth, ...publicApi, ...files, ...recruiter, ...admin, ...offers, ...trust, ...settings, ...guides, ...proofs };
