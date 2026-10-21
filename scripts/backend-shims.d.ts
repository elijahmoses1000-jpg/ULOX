// The platform injects @appdeploy/sdk at deploy time and ships no types with
// it. This shim exists only so the rest of the backend can be typechecked:
// it deliberately types the SDK as any rather than guessing its shape, which
// would be a second source of truth that could drift from the real thing.
declare module '@appdeploy/sdk';
