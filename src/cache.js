class PDFCache {
  context;
  constructor(context) {
    this.context = context;
  }

  get(key = "") {
    const data = this.context.workspaceState.get("testPDFExtractor_cache");

    if (key === "") return data;
    return data?.[key];
  }

  async update(object) {
    console.log("Updating cache!");

    await this.context.workspaceState.update(`testPDFExtractor_cache`, {
      ...object,
      date: Date.now(),
    });

    console.log("Update successfull!");
  }

  async clear() {
    await this.context.workspaceState.update(`testPDFExtractor_cache`, {});
  }

  isExpired() {
    const date = this.get("date");

    if (!date) return true;

    return Date.now() - date > 1000 * 60 * 60;
  }
}

module.exports = { PDFCache };
