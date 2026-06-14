/**
 * Users module — use common/security/user.serialization.ts for all API-facing user shapes.
 */
export {
  mapUserPublicToDto,
  mapUserSessionToAuthDto,
  mapUserSummaryToDto,
  stripForbiddenUserFields,
  USER_PUBLIC_SELECT,
  USER_SESSION_SELECT,
} from '../../common/security/user.serialization.js';
