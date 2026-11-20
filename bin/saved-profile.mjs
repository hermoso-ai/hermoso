// A SAVED PROFILE THAT IS GONE (2026-11-20, QA): ~/.hermoso/config.json named a profile ("p_zeta") that no longer
// exists on the account, the CLI sent it as x-heist-user on every request, and the server refused EVERY call with
// "No profile with id ...". A user could not even run list_brands to find a good id without editing a JSON file.
// Now the CLI checks a saved profile ONCE (it remembers the profile it verified), and when the account answers
// that the profile is not there it falls back to the default profile with one line on stderr and clears it from
// the config. A read that FAILED is not an answer: the saved profile is kept and used, never dropped on a blip.
//
// PURE apart from the injected fetch, so tools/cli-saved-profile-check.mjs runs it against a stub server.

/**
 * @returns {Promise<'ok'|'missing'|'unknown'>} whether `profile` is one of the account's own profiles.
 * 'unknown' covers every failed or unreadable answer: the caller keeps the saved profile.
 */
export async function savedProfileState({ apiBase, token, profile, fetchImpl = globalThis.fetch, timeoutMs = 8000 }) {
  if (!profile || profile === 'default' || !token) return 'ok';
  let res;
  try { res = await fetchImpl(`${String(apiBase).replace(/\/+$/, '')}/api/brands`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(timeoutMs) }); }
  catch { return 'unknown'; }
  if (!res || !res.ok) return 'unknown';
  let j; try { j = await res.json(); } catch { return 'unknown'; }
  const brands = (j && (j.data?.brands || j.brands)) || null;
  if (!Array.isArray(brands) || !brands.length) return 'unknown'; // an account always has its default profile: an empty list is not an answer
  return brands.some((b) => b && String(b.id) === String(profile)) ? 'ok' : 'missing';
}

/**
 * Decide the profile this run acts on. Returns { profile, cfg, changed, warning }: `cfg` is the config to save when
 * `changed`. Skipped (kept as is) for a shared workspace (cfg.owner: another account's profile, not in this list),
 * for HERMOSO_PROFILE set in the environment, and for a profile already verified.
 */
export async function resolveSavedProfile(cfg, { env = process.env, apiBase, token, fetchImpl } = {}) {
  const c = { ...(cfg || {}) };
  const saved = c.profile && c.profile !== 'default' ? String(c.profile) : '';
  if (!saved || env.HERMOSO_PROFILE || c.owner || c.profileVerified === saved) return { profile: saved, cfg: c, changed: false, warning: '' };
  const st = await savedProfileState({ apiBase, token, profile: saved, fetchImpl });
  if (st === 'ok') { c.profileVerified = saved; return { profile: saved, cfg: c, changed: true, warning: '' }; }
  if (st === 'unknown') return { profile: saved, cfg: c, changed: false, warning: '' };
  delete c.profile; delete c.profileVerified;
  return { profile: '', cfg: c, changed: true, warning: `hermoso: the saved profile "${saved}" is not on this account any more, so this runs on your default profile (cleared from ~/.hermoso/config.json; list_brands shows your profiles, use_brand picks one).` };
}
