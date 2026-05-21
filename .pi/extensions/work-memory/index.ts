import {
  checkWorkMemoryWrite,
  createWorkMemoryExtension,
  registerWorkMemoryExtension,
  type PiExtensionApi,
  type WorkMemoryExtensionOptions
} from "../../../packages/pi-extension/src/index";

export {
  checkWorkMemoryWrite,
  createWorkMemoryExtension,
  registerWorkMemoryExtension
};
export type {
  PiExtensionApi,
  WorkMemoryCommandDefinition,
  WorkMemoryCommandName,
  WorkMemoryExtensionOptions,
  WorkMemoryToolDefinition,
  WorkMemoryToolName,
  WorkMemoryWriteGuard,
  WorkMemoryWriteGuardResult,
  WorkMemoryWriteRequest
} from "../../../packages/pi-extension/src/index";

export function workMemoryExtension(
  apiOrOptions?: PiExtensionApi | WorkMemoryExtensionOptions,
  options: WorkMemoryExtensionOptions = {}
): ReturnType<typeof createWorkMemoryExtension> {
  if (isPiExtensionApi(apiOrOptions)) {
    return registerWorkMemoryExtension(apiOrOptions, options);
  }

  return createWorkMemoryExtension(apiOrOptions ?? options);
}

export const factory = workMemoryExtension;

export default workMemoryExtension;

function isPiExtensionApi(value: PiExtensionApi | WorkMemoryExtensionOptions | undefined): value is PiExtensionApi {
  return (
    typeof value === "object" &&
    value !== null &&
    ("registerTool" in value ||
      "registerCommand" in value ||
      "registerWriteGuard" in value ||
      "onBeforeWrite" in value)
  );
}
