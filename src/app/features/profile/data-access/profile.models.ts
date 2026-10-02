/**
 * Body of `PUT /auth/password`. The caller acts only on themselves — there is
 * no user id in the body, the server resolves it from the token — and must
 * prove the current password (`ChangePasswordCommandValidator`): `newPassword`
 * requires min 8 / max 128 chars, an uppercase letter, a lowercase letter and
 * a digit.
 */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}
