import { SOCKET_EVENTS, SOCKET_ROOMS } from '../../constants/socketEvents.js';
import { getIO } from '../socket.server.js';
import { logger } from '../../logs/logger.js';

/**
 * Pushes a catalog version change to every connected client.
 *
 * Payload is deliberately tiny — just the new version. Clients decide what to revalidate; we do
 * not push catalog data down the socket, because a client that has been disconnected would then
 * miss it silently. The version is a *signal*, and the HTTP path stays the single source of data.
 */
export function emitCatalogVersionChanged(version: string): void {
  try {
    getIO().to(SOCKET_ROOMS.catalog).emit(SOCKET_EVENTS.CATALOG_VERSION_CHANGED, { version });
  } catch {
    // No socket server (worker process, tests) — clients fall back to the periodic version poll.
    logger.debug('Catalog version change not pushed; no socket server in this process', { version });
  }
}
