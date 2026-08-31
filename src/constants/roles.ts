import { RoleName } from '@prisma/client';

export const ROLES = RoleName;

/**
 * Numeric rank for `authorizeMinRole`. SUPPORT sits at 45 — above STAFF, below MANAGER — because a
 * support operator must be able to act on any vendor's ticket (which a shop-floor STAFF user
 * cannot) while having no reach into production, pricing or finance. Rank alone never grants
 * anything: every route still names the roles it accepts.
 */
export const ROLE_HIERARCHY: Record<RoleName, number> = {
  [RoleName.SUPER_ADMIN]: 100,
  [RoleName.ADMIN]: 80,
  [RoleName.MANAGER]: 60,
  [RoleName.SUPPORT]: 45,
  [RoleName.STAFF]: 40,
  /// Below STAFF: a delivery person's reach is narrower than a shop-floor operator's, not wider.
  [RoleName.DELIVERY]: 30,
  [RoleName.VENDOR]: 20,
  [RoleName.CUSTOMER]: 10,
};

export const INTERNAL_ROLES: RoleName[] = [
  RoleName.SUPER_ADMIN,
  RoleName.ADMIN,
  RoleName.MANAGER,
  RoleName.SUPPORT,
  RoleName.STAFF,
  RoleName.DELIVERY,
];

export const EXTERNAL_ROLES: RoleName[] = [RoleName.CUSTOMER, RoleName.VENDOR];

/**
 * Who may work the support desk.
 *
 * Declared once, here, and spread into every support route. When the dedicated support panel
 * ships, its middleware reads this same list — so adding or removing a role that can handle
 * tickets is a one-line change rather than an audit of a dozen route files.
 */
export const SUPPORT_DESK_ROLES: RoleName[] = [
  RoleName.SUPER_ADMIN,
  RoleName.ADMIN,
  RoleName.MANAGER,
  RoleName.SUPPORT,
];

/** Roles that may decide a reprint and create the replacement order. */
export const SUPPORT_DECISION_ROLES: RoleName[] = [
  RoleName.SUPER_ADMIN,
  RoleName.ADMIN,
  RoleName.MANAGER,
  RoleName.SUPPORT,
];

/** Roles that may configure the desk itself (window days, SLA, policy text). */
export const SUPPORT_ADMIN_ROLES: RoleName[] = [
  RoleName.SUPER_ADMIN,
  RoleName.ADMIN,
];


/**
 * Who may run the delivery department from the admin side — configure services, tag delivery
 * persons, and reassign a consignment.
 *
 * Declared once here and spread into the delivery routes, exactly as the support lists are. A
 * dedicated delivery supervisor role later is a change to this array, not to a dozen route files.
 */
export const DELIVERY_DESK_ROLES: RoleName[] = [
  RoleName.SUPER_ADMIN,
  RoleName.ADMIN,
  RoleName.MANAGER,
];

/** Roles that may create and edit the delivery service master. */
export const DELIVERY_ADMIN_ROLES: RoleName[] = [RoleName.SUPER_ADMIN, RoleName.ADMIN];

/**
 * Who may work a consignment from the delivery portal.
 *
 * Includes the desk roles so a manager can demonstrate or cover the flow, but a DELIVERY user is
 * the normal case — and what they can see is decided by their service tags, never by this list.
 */
export const DELIVERY_PORTAL_ROLES: RoleName[] = [
  RoleName.SUPER_ADMIN,
  RoleName.ADMIN,
  RoleName.MANAGER,
  RoleName.DELIVERY,
];
