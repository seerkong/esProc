import type { DataSource, DataSourceConfig } from "../datasource/types";
import { DataSourceFactory } from "../datasource/factory";

export class ConnectionRegistry {
  private readonly connections = new Map<string, DataSource>();

  register(config: DataSourceConfig): void {
    if (this.connections.has(config.name)) {
      throw new Error(`Connection '${config.name}' already registered`);
    }
    const dataSource = DataSourceFactory.create(config);
    this.connections.set(config.name, dataSource);
  }

  get(name: string): DataSource | undefined {
    return this.connections.get(name);
  }

  has(name: string): boolean {
    return this.connections.has(name);
  }

  async closeAll(): Promise<void> {
    for (const [, dataSource] of this.connections) {
      if (dataSource.close) {
        await dataSource.close();
      }
    }
    this.connections.clear();
  }
}
