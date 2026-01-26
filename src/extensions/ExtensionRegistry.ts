import type { Extension, ExtensionConfig, Hooks } from './index.js';

/**
 * Manages registration and lifecycle of extensions.
 */
export class ExtensionRegistry {
  private extensions: Map<string, Extension> = new Map();
  private configs: Map<string, ExtensionConfig> = new Map();

  /**
   * Register an extension. Does not enable it.
   */
  register(extension: Extension): void {
    if (this.extensions.has(extension.id)) {
      throw new Error(`Extension "${extension.id}" is already registered`);
    }
    this.extensions.set(extension.id, extension);
    this.configs.set(extension.id, { enabled: false });
  }

  /**
   * Enable an extension by ID.
   */
  enable(extensionId: string, options?: Record<string, unknown>): void {
    if (!this.extensions.has(extensionId)) {
      throw new Error(`Extension "${extensionId}" is not registered`);
    }
    this.configs.set(extensionId, { enabled: true, options });
  }

  /**
   * Disable an extension by ID.
   */
  disable(extensionId: string): void {
    const config = this.configs.get(extensionId);
    if (config) {
      config.enabled = false;
    }
  }

  /**
   * Check if an extension is enabled.
   */
  isEnabled(extensionId: string): boolean {
    return this.configs.get(extensionId)?.enabled ?? false;
  }

  /**
   * Get an extension by ID.
   */
  getExtension(extensionId: string): Extension | undefined {
    return this.extensions.get(extensionId);
  }

  /**
   * Get all registered extensions.
   */
  getAllExtensions(): Extension[] {
    return Array.from(this.extensions.values());
  }

  /**
   * Get all enabled extensions.
   */
  getEnabledExtensions(): Extension[] {
    return this.getAllExtensions().filter(ext => this.isEnabled(ext.id));
  }

  /**
   * Get all enabled extensions that implement a specific hook.
   * Returns an array of objects containing the extension and its hook function.
   */
  getHook<K extends keyof Hooks>(
    hookName: K
  ): Array<{ extension: Extension; hook: NonNullable<Hooks[K]> }> {
    const result: Array<{ extension: Extension; hook: NonNullable<Hooks[K]> }> = [];

    for (const extension of this.getEnabledExtensions()) {
      const hook = extension.hooks[hookName];
      if (hook) {
        result.push({ extension, hook: hook as NonNullable<Hooks[K]> });
      }
    }

    return result;
  }

  /**
   * Execute a hook on all enabled extensions that implement it.
   * Useful for hooks that don't return values (like onFunctionExtracted).
   */
  executeHook<K extends keyof Hooks>(
    hookName: K,
    ...args: Hooks[K] extends (...args: infer P) => unknown ? P : never
  ): void {
    for (const { hook } of this.getHook(hookName)) {
      (hook as (...args: unknown[]) => unknown)(...args);
    }
  }
}
