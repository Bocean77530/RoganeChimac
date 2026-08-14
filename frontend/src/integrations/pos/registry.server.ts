import type { PosAdapter } from "../../domain/integrations";
import { MockPosAdapter } from "./mock-pos.server";

export class PosAdapterRegistry {
  private readonly adapters = new Map<string, PosAdapter>();

  constructor(adapters: readonly PosAdapter[] = []) {
    for (const adapter of adapters) this.register(adapter);
  }

  register(adapter: PosAdapter): void {
    if (this.adapters.has(adapter.provider)) {
      throw new Error(`POS adapter already registered: ${adapter.provider}`);
    }
    this.adapters.set(adapter.provider, adapter);
  }

  get(provider: string): PosAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) throw new Error(`Unknown POS adapter: ${provider}`);
    return adapter;
  }

  providers(): string[] {
    return [...this.adapters.keys()].sort();
  }
}

export function createDefaultPosAdapterRegistry(): PosAdapterRegistry {
  return new PosAdapterRegistry([new MockPosAdapter()]);
}
