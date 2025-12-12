class ToolRegistry {
   constructor() {
      this.tools = new Map();
   }

   register(tool) {
      if (!tool.name || !tool.execute) {
         throw new Error('Tool must have name and execute function');
      }
      this.tools.set(tool.name, tool);
      return this;
   }

   registerMany(tools) {
      tools.forEach(tool => this.register(tool));
      return this;
   }

   get(name) {
      return this.tools.get(name);
   }

   has(name) {
      return this.tools.has(name);
   }

   async execute(name, params, context) {
      const tool = this.tools.get(name);
      if (!tool) {
         throw new Error(`Tool not found: ${name}`);
      }
      return await tool.execute(params, context);
   }

   getDefinitions() {
      const definitions = [];
      for (const [name, tool] of this.tools) {
         definitions.push({
            name,
            description: tool.description || '',
            parameters: tool.parameters || {}
         });
      }
      return definitions;
   }

   getToolsForPrompt() {
      const defs = this.getDefinitions();
      return defs.map(t => {
         const params = Object.entries(t.parameters || {})
            .map(([key, val]) => `  - ${key}: ${val.type}${val.required ? ' (required)' : ''} - ${val.description || ''}`)
            .join('\n');
         return `${t.name}: ${t.description}\n${params}`;
      }).join('\n\n');
   }

   list() {
      return Array.from(this.tools.keys());
   }
}


module.exports = ToolRegistry;

