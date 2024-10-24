class WorkspaceCache {
  context;
  cacheKey;
  constructor(context, cacheKey) {
    this.context = context;
    this.cacheKey = cacheKey;
  }

  get(key = "") {
    const data = this.context.workspaceState.get(this.cacheKey);

    if (key === "") return data;
    return data?.[key];
  }

  async update(object) {
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

    if (!date) return true;

    return Date.now() - date > 1000 * 60 * 60;
  }
}

module.exports = { WorkspaceCache };
