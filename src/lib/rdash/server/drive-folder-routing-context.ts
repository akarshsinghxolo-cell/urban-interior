import { AsyncLocalStorage } from "node:async_hooks";

type DriveFolderRoutingContext = {
  sourceFlow?: string;
  attachmentField?: string;
  attachmentFieldMode?: string;
  role?: string;
  kind?: string;
  caption?: string;
};

const routingStorage = new AsyncLocalStorage<DriveFolderRoutingContext>();

export function withDriveFolderRouting<T>(
  context: DriveFolderRoutingContext,
  operation: () => Promise<T>,
): Promise<T> {
  return routingStorage.run(context, operation);
}

export function currentDriveFolderRouting(): DriveFolderRoutingContext | undefined {
  return routingStorage.getStore();
}
