import { ModuleRegistry, AllCommunityModule, type Module } from "ag-grid-community";
import { AllEnterpriseModule, LicenseManager } from "ag-grid-enterprise";

export interface AgGridInitOptions {
  licenseKey?: string;
  modules?: Module[];
  logger?: (msg: string) => void;
}

const DEFAULT_DEV_LICENSE = "DownloadDevTools_COM_NDEwMjM0NTgwMDAwMA==59158b5225400879a12a96634544f5b6";

let initialized = false;

export function initAgGrid(options?: AgGridInitOptions) {
  if (initialized) return;
  initialized = true;

  const modules = options?.modules ?? [AllCommunityModule, AllEnterpriseModule];
  ModuleRegistry.registerModules(modules);

  const key =
    options?.licenseKey ??
    (typeof process !== "undefined" ? process.env.VITE_AG_GRID_LICENSE_KEY ?? process.env.AG_GRID_LICENSE_KEY : undefined) ??
    DEFAULT_DEV_LICENSE;
  try {
    LicenseManager.setLicenseKey(key);
  } catch (err) {
    options?.logger?.(`[ag-grid] failed to set license: ${err}`);
  }

  options?.logger?.("[ag-grid] modules registered");
  return { licenseKey: key, registeredModules: modules.length };
}
