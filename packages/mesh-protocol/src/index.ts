// BREAKING CHANGE: MeshProtocol now supports fragmentation natively
export * from './protocol.js';
export { MeshProtocol, type MeshConfig, type MeshNode } from './protocol.js';

// Legacy protocol (no fragmentation support)
export * from './protocol-legacy.js';
export { MeshProtocol as LegacyMeshProtocol, type MeshConfig as LegacyMeshConfig } from './protocol-legacy.js';
