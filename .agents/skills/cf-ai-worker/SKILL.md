```markdown
# cf-ai-worker Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill outlines the key development patterns, coding conventions, and workflows used in the `cf-ai-worker` TypeScript codebase. The repository focuses on managing and refreshing AI model configurations for Workers AI, with a strong emphasis on maintainable code, clear documentation, and robust testing. The guide will help you contribute effectively by following established conventions and workflows.

## Coding Conventions

### File Naming
- Use **kebab-case** for all file and directory names.
  - Example: `model-config.test.mjs`, `superpowers/plans/model-refresh.md`

### Import Style
- Use **absolute imports** for modules.
  - Example:
    ```typescript
    import { getModelConfig } from 'src/config/models';
    ```

### Export Style
- Use **named exports** for all modules.
  - Example:
    ```typescript
    // src/config/models.ts
    export const modelConfig = { ... };
    export function getModelConfig(name: string) { ... }
    ```

### Commit Messages
- Follow **conventional commit** format.
- Prefixes: `docs`, `feat`, `chore`
  - Example: `feat: add new AI model to config`

## Workflows

### Model Config Refresh
**Trigger:** When you need to add, update, or refresh available AI models and document the changes.  
**Command:** `/refresh-models`

1. **Update model configuration**  
   Edit `src/config/models.ts` to add or update model entries.
   ```typescript
   // Example addition
   export const modelConfig = {
     ...,
     "new-model": {
       name: "New Model",
       version: "v1.0",
       description: "Latest AI model for text generation"
     }
   };
   ```
2. **Add or update documentation**  
   - Update or create plan and design docs in:
     - `docs/superpowers/plans/`
     - `docs/superpowers/specs/`
   - Example: `docs/superpowers/plans/new-model-plan.md`
3. **Update README.md**  
   - Document usage, model mapping, or any relevant instructions.
   - Example:
     ```markdown
     ## New Model
     To use the new model, set `model: "new-model"` in your request.
     ```
4. **Update or add tests**  
   - Edit or create tests in:
     - `tests/model-config.test.mjs`
     - `tests/model-routing.test.mjs`
   - Example:
     ```javascript
     // tests/model-config.test.mjs
     import { modelConfig } from 'src/config/models';
     test('new-model is present', () => {
       expect(modelConfig['new-model']).toBeDefined();
     });
     ```
5. **Commit your changes**  
   - Use a conventional commit message, e.g., `feat: refresh model config for new-model`

## Testing Patterns

- **Test files** use the `*.test.*` naming pattern (e.g., `model-config.test.mjs`).
- The testing framework is not explicitly specified, but tests are written in JavaScript/TypeScript.
- Place test files in the `tests/` directory.
- Example test:
  ```javascript
  // tests/model-config.test.mjs
  import { modelConfig } from 'src/config/models';
  test('should contain all required models', () => {
    expect(Object.keys(modelConfig)).toContain('new-model');
  });
  ```

## Commands

| Command          | Purpose                                               |
|------------------|-------------------------------------------------------|
| /refresh-models  | Refresh or update the Workers AI model configuration. |

```