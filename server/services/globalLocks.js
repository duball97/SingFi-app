/**
 * Global locks to prevent duplicate processing
 * Used to prevent multiple simultaneous calls to expensive operations
 */
export const vocalLocks = new Map();

