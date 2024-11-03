import { ExtensionContext } from "vscode";

export class WorkspaceCache<CacheObject extends { date: number }> {
  context;
  cacheKey;
  constructor(context: ExtensionContext, cacheKey: string) {
    this.context = context;
    this.cacheKey = cacheKey;
  }

  get<K extends keyof CacheObject>(key: K) {
    const data = this.context.workspaceState.get<CacheObject>(this.cacheKey);

    return data?.[key];
  }

  getAll() {
    return this.context.workspaceState.get<CacheObject>(this.cacheKey);
  }

  async update(object: Omit<CacheObject, "date">) {
    console.log("Updating cache!");

    await this.context.workspaceState.update(this.cacheKey, {
      ...object,
      date: Date.now(),
    });

    console.log("Update successfull!");
  }

  async clear() {
    await this.context.workspaceState.update(this.cacheKey, {});
  }

  isExpired() {
    const date = this.get("date");

    if (!date) {
      return true;
    }

    return Date.now() - date > 1000 * 60 * 60;
  }
}
