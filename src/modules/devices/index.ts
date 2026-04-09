// Public API of the devices module. Anything not re-exported here is an
// internal implementation detail and should NOT be imported from outside
// the module — that's how we keep modules decoupled as the codebase grows.
export { devicesRouter } from "./devices.routes";
export { devicesPaths } from "./devices.openapi";
