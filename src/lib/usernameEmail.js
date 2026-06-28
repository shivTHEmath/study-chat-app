// Participants log in with a plain username, never an email. Supabase Auth
// requires an email-shaped identifier internally, so we map the username to a
// synthetic address. The account is created server-side with the admin API
// (email_confirm: true), so no email is ever sent to this address.
//
// NOTE: accounts must be created via the admin API (see
// /api/register-participant). The public client-side signUp endpoint rejects
// the reserved `.local` TLD as "invalid"; the admin API and password sign-in
// both accept it.
export const STUDY_EMAIL_DOMAIN = 'study.local'

export function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@${STUDY_EMAIL_DOMAIN}`
}
