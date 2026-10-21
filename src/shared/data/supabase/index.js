// The Supabase backend: same function names as the demo backend (see ../demo/index.js).
import * as activity from './activity';
import * as admin from './admin';
import * as alerts from './alerts';
import * as auth from './auth';
import * as files from './files';
import * as guides from './guides';
import * as offers from './offers';
import * as publicApi from './public';
import * as recruiter from './recruiter';
import * as settings from './settings';
import * as trust from './trust';
import * as verification from './verification';

export const supabaseApi = { ...auth, ...publicApi, ...files, ...recruiter, ...admin, ...offers, ...trust, ...settings, ...guides, ...verification, ...alerts, ...activity };
