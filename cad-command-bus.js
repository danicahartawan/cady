export class CadCommandBus {
  #commands = new Map();
  #listeners = new Set();
  #running = null;

  register(name, definition) {
    if (!name || typeof definition?.execute !== "function") {
      throw new TypeError("A CAD command needs a name and execute function");
    }
    this.#commands.set(name, Object.freeze({ name, ...definition }));
    return this;
  }

  describe(name) {
    const command = this.#commands.get(name);
    if (!command) return null;
    const { execute, canExecute, ...description } = command;
    return description;
  }

  list() {
    return [...this.#commands.keys()].map((name) => this.describe(name));
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async execute(name, input = {}, context = {}) {
    const command = this.#commands.get(name);
    if (!command) throw new Error(`Unknown CAD command: ${name}`);
    if (this.#running && !command.concurrent) {
      throw new Error(`CAD command ${this.#running} is still running`);
    }
    if (command.canExecute && !(await command.canExecute(input, context))) {
      throw new Error(`CAD command ${name} is unavailable in the current document`);
    }
    this.#running = name;
    this.#emit({ type: "started", name, input, source: context.source || "unknown" });
    try {
      const result = await command.execute(input, context);
      this.#emit({ type: "completed", name, input, result, source: context.source || "unknown" });
      return result;
    } catch (error) {
      this.#emit({ type: "failed", name, input, error: error.message, source: context.source || "unknown" });
      throw error;
    } finally {
      this.#running = null;
    }
  }

  async runScript(steps, context = {}) {
    if (!Array.isArray(steps)) throw new TypeError("A CAD script must be an array of command steps");
    const results = [];
    for (const step of steps) {
      results.push(await this.execute(step.command, step.input || {}, { ...context, source: context.source || "script" }));
    }
    return results;
  }

  #emit(event) {
    this.#listeners.forEach((listener) => listener(event));
  }
}

export const cadCommands = new CadCommandBus();

