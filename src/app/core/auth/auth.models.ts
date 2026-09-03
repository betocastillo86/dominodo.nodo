/** Credentials submitted to `POST /auth/login`. */
export interface LoginRequest {
  phone: string;
  password: string;
}

/** Token envelope returned by `/auth/login` and `/auth/refresh`. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** ISO-8601 expiry of the access token. */
  expiresAt: string;
}

/**
 * Claims read from the (tenant-agnostic) JWT. Only what the portal needs.
 * The JWT carries NO permissions — those come from `GET /auth/current`.
 * `role` may arrive as a single string or an array — normalize via `jwt.util`.
 */
export interface JwtClaims {
  sub: string;
  jti: string;
  role?: string | string[];
  /** Expiry as a UNIX timestamp (seconds), when present. */
  exp?: number;
  [claim: string]: unknown;
}

/**
 * The authenticated principal. `id`/`roles` are derived from the JWT claims;
 * the profile fields (`name`/`email`/`roleName`) are filled from
 * `GET /auth/current` after login/startup.
 */
export interface AuthUser {
  id: string;
  /** Roles are for display only; they do not gate access in this portal. */
  roles: string[];
  /** Full name ("First Last"), from `/auth/current`. */
  name?: string;
  email?: string | null;
  /** Role name of the caller's Active membership in this tenant. */
  roleName?: string | null;
}

// --- GET /auth/current (typed exactly as the API returns it; do not rename) ---

export type UserStatus = 'PendingVerification' | 'Active' | 'Disabled';
export type MembershipStatus = 'Invited' | 'Active' | 'Suspended';

/** The caller's user profile (`UserDto`). */
export interface CurrentUser {
  id: string;
  phone: string;
  email: string | null;
  firstName: string;
  lastName: string;
  status: UserStatus;
  phoneVerified: boolean;
}

/** A membership of the caller in a tenant (`MembershipDto`). */
export interface Membership {
  /** Membership id — required by the `/memberships/{id}/…` write endpoints. */
  id: string;
  userId: string;
  tenantId: string;
  roleId: number;
  roleName: string;
  status: MembershipStatus;
  userName: string;
  phone: string;
  email: string | null;
  invitedAtUtc: string | null;
  joinedAtUtc: string | null;
}

/**
 * Response of `GET /auth/current` (`CurrentUserResponse`): the caller's profile,
 * effective permission codes for the resolved tenant, and their membership(s)
 * in that tenant (empty when the caller has none).
 */
export interface CurrentUserResponse {
  user: CurrentUser;
  permissions: string[];
  memberships: Membership[];
}
