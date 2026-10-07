// The Supabase backend: same function names as the demo backend (see ../demo/index.js).
import * as admin from './admin';
import * as auth from './auth';
import * as files from './files';
import * as offers from './offers';
import * as publicApi from './public';
import * as recruiter from './recruiter';

export const supabaseApi = { ...auth, ...publicApi, ...files, ...recruiter, ...admin, ...offers };
