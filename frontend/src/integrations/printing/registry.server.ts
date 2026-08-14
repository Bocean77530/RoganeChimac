import type { PrintAdapter } from "../../domain/integrations";
import { MockPrintAdapter } from "./mock-print.server";

export class PrintAdapterRegistry {
  private readonly adapters = new Map<string, PrintAdapter>();

  constructor(adapters: readonly PrintAdapter[] = []) {
    for (const adapter of adapters) this.register(adapter);
  }

  register(adapter: PrintAdapter): void {
    if (this.adapters.has(adapter.provider)) {
      throw new Error(`Print adapter already registered: ${adapter.provider}`);
    }
    this.adapters.set(adapter.provider, adapter);
  }

  get(provider: string): PrintAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) throw new Error(`Unknown print adapter: ${provider}`);
    return adapter;
  }

  providers(): string[] {
    return [...this.adapters.keys()].sort();
  }
}

export function createDefaultPrintAdapterRegistry(): PrintAdapterRegistry {
  return new PrintAdapterRegistry([new MockPrintAdapter()]);
}
