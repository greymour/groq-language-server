import { describe, it, expect, beforeEach } from 'vitest';
import { SchemaLoader } from '../../src/schema/SchemaLoader.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('SchemaLoader validation', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-test-'));
  });

  function writeTempSchema(schema: unknown): string {
    const filePath = path.join(tempDir, 'schema.json');
    fs.writeFileSync(filePath, JSON.stringify(schema));
    return filePath;
  }

  describe('default validation config', () => {
    it('uses default config when none provided', () => {
      const loader = new SchemaLoader();
      const config = loader.getValidationConfig();

      expect(config.enabled).toBe(true);
      expect(config.maxDepth).toBe(50);
      expect(config.maxTypes).toBe(10000);
      expect(config.maxFieldsPerType).toBe(1000);
    });
  });

  describe('custom validation config', () => {
    it('accepts custom config through constructor', () => {
      const loader = new SchemaLoader({
        enabled: false,
        maxDepth: 100,
        maxTypes: 500,
        maxFieldsPerType: 50,
      });
      const config = loader.getValidationConfig();

      expect(config.enabled).toBe(false);
      expect(config.maxDepth).toBe(100);
      expect(config.maxTypes).toBe(500);
      expect(config.maxFieldsPerType).toBe(50);
    });

    it('merges partial config with defaults', () => {
      const loader = new SchemaLoader({ maxDepth: 25 });
      const config = loader.getValidationConfig();

      expect(config.enabled).toBe(true);
      expect(config.maxDepth).toBe(25);
      expect(config.maxTypes).toBe(10000);
      expect(config.maxFieldsPerType).toBe(1000);
    });
  });

  describe('updateValidationConfig', () => {
    it('updates config at runtime', () => {
      const loader = new SchemaLoader();
      loader.updateValidationConfig({ maxDepth: 10 });

      const config = loader.getValidationConfig();
      expect(config.maxDepth).toBe(10);
      expect(config.enabled).toBe(true);
    });

    it('merges updates with existing config', () => {
      const loader = new SchemaLoader({ maxDepth: 20, maxTypes: 100 });
      loader.updateValidationConfig({ maxTypes: 200 });

      const config = loader.getValidationConfig();
      expect(config.maxDepth).toBe(20);
      expect(config.maxTypes).toBe(200);
    });
  });

  describe('depth limit validation', () => {
    it('rejects schema exceeding max depth', async () => {
      const loader = new SchemaLoader({ maxDepth: 3 });

      const deeplyNestedSchema = {
        types: [{
          name: 'test',
          type: 'document',
          fields: [{
            name: 'field1',
            type: 'object',
            nested: {
              level2: {
                level3: {
                  level4: {
                    tooDeep: true,
                  },
                },
              },
            },
          }],
        }],
      };

      const filePath = writeTempSchema(deeplyNestedSchema);
      const result = await loader.loadFromPath(filePath);

      expect(result).toBe(false);
      expect(loader.getLastValidationError()).toContain('maximum nesting depth');
    });

    it('accepts schema within depth limit', async () => {
      const loader = new SchemaLoader({ maxDepth: 10 });

      const validSchema = {
        types: [{
          name: 'test',
          type: 'document',
          fields: [{ name: 'title', type: 'string' }],
        }],
      };

      const filePath = writeTempSchema(validSchema);
      const result = await loader.loadFromPath(filePath);

      expect(result).toBe(true);
      expect(loader.getLastValidationError()).toBeNull();
    });
  });

  describe('max types validation', () => {
    it('rejects Sanity schema exceeding max types', async () => {
      const loader = new SchemaLoader({ maxTypes: 2 });

      const schemaWithManyTypes = {
        types: [
          { name: 'type1', type: 'document' },
          { name: 'type2', type: 'document' },
          { name: 'type3', type: 'document' },
        ],
      };

      const filePath = writeTempSchema(schemaWithManyTypes);
      const result = await loader.loadFromPath(filePath);

      expect(result).toBe(false);
      expect(loader.getLastValidationError()).toContain('3 types');
      expect(loader.getLastValidationError()).toContain('maximum of 2');
    });

    it('rejects GROQ type schema exceeding max types', async () => {
      const loader = new SchemaLoader({ maxTypes: 2 });

      const groqTypeSchema = [
        { name: 'type1', type: 'document', attributes: {} },
        { name: 'type2', type: 'document', attributes: {} },
        { name: 'type3', type: 'document', attributes: {} },
      ];

      const filePath = writeTempSchema(groqTypeSchema);
      const result = await loader.loadFromPath(filePath);

      expect(result).toBe(false);
      expect(loader.getLastValidationError()).toContain('3 types');
    });

    it('accepts schema within type limit', async () => {
      const loader = new SchemaLoader({ maxTypes: 5 });

      const validSchema = {
        types: [
          { name: 'type1', type: 'document' },
          { name: 'type2', type: 'document' },
        ],
      };

      const filePath = writeTempSchema(validSchema);
      const result = await loader.loadFromPath(filePath);

      expect(result).toBe(true);
    });
  });

  describe('max fields per type validation', () => {
    it('rejects Sanity type exceeding max fields', async () => {
      const loader = new SchemaLoader({ maxFieldsPerType: 2 });

      const schemaWithManyFields = {
        types: [{
          name: 'test',
          type: 'document',
          fields: [
            { name: 'field1', type: 'string' },
            { name: 'field2', type: 'string' },
            { name: 'field3', type: 'string' },
          ],
        }],
      };

      const filePath = writeTempSchema(schemaWithManyFields);
      const result = await loader.loadFromPath(filePath);

      expect(result).toBe(false);
      expect(loader.getLastValidationError()).toContain('test');
      expect(loader.getLastValidationError()).toContain('3 fields');
      expect(loader.getLastValidationError()).toContain('maximum of 2');
    });

    it('rejects GROQ type schema exceeding max fields', async () => {
      const loader = new SchemaLoader({ maxFieldsPerType: 2 });

      const groqTypeSchema = [{
        name: 'test',
        type: 'document',
        attributes: {
          field1: { type: 'objectAttribute', value: { type: 'string' } },
          field2: { type: 'objectAttribute', value: { type: 'string' } },
          field3: { type: 'objectAttribute', value: { type: 'string' } },
        },
      }];

      const filePath = writeTempSchema(groqTypeSchema);
      const result = await loader.loadFromPath(filePath);

      expect(result).toBe(false);
      expect(loader.getLastValidationError()).toContain('test');
      expect(loader.getLastValidationError()).toContain('3 fields');
    });

    it('accepts type within field limit', async () => {
      const loader = new SchemaLoader({ maxFieldsPerType: 10 });

      const validSchema = {
        types: [{
          name: 'test',
          type: 'document',
          fields: [
            { name: 'field1', type: 'string' },
            { name: 'field2', type: 'string' },
          ],
        }],
      };

      const filePath = writeTempSchema(validSchema);
      const result = await loader.loadFromPath(filePath);

      expect(result).toBe(true);
    });
  });

  describe('structure validation - Sanity schema', () => {
    it('rejects schema type missing name', async () => {
      const loader = new SchemaLoader();

      const invalidSchema = {
        types: [{ type: 'document' }],
      };

      const filePath = writeTempSchema(invalidSchema);
      const result = await loader.loadFromPath(filePath);

      expect(result).toBe(false);
      expect(loader.getLastValidationError()).toContain('missing required "name"');
    });

    it('rejects schema type missing type field', async () => {
      const loader = new SchemaLoader();

      const invalidSchema = {
        types: [{ name: 'test' }],
      };

      const filePath = writeTempSchema(invalidSchema);
      const result = await loader.loadFromPath(filePath);

      expect(result).toBe(false);
      expect(loader.getLastValidationError()).toContain('missing required "type"');
    });

    it('rejects schema with non-array types', async () => {
      const loader = new SchemaLoader();

      const invalidSchema = {
        types: 'not an array',
      };

      const filePath = writeTempSchema(invalidSchema);
      const result = await loader.loadFromPath(filePath);

      expect(result).toBe(false);
      expect(loader.getLastValidationError()).toContain('does not match expected');
    });

    it('rejects field missing name', async () => {
      const loader = new SchemaLoader();

      const invalidSchema = {
        types: [{
          name: 'test',
          type: 'document',
          fields: [{ type: 'string' }],
        }],
      };

      const filePath = writeTempSchema(invalidSchema);
      const result = await loader.loadFromPath(filePath);

      expect(result).toBe(false);
      expect(loader.getLastValidationError()).toContain('missing required "name"');
    });

    it('rejects field missing type', async () => {
      const loader = new SchemaLoader();

      const invalidSchema = {
        types: [{
          name: 'test',
          type: 'document',
          fields: [{ name: 'title' }],
        }],
      };

      const filePath = writeTempSchema(invalidSchema);
      const result = await loader.loadFromPath(filePath);

      expect(result).toBe(false);
      expect(loader.getLastValidationError()).toContain('missing required "type"');
    });

    it('rejects non-array fields', async () => {
      const loader = new SchemaLoader();

      const invalidSchema = {
        types: [{
          name: 'test',
          type: 'document',
          fields: 'not an array',
        }],
      };

      const filePath = writeTempSchema(invalidSchema);
      const result = await loader.loadFromPath(filePath);

      expect(result).toBe(false);
      expect(loader.getLastValidationError()).toContain('must be an array');
    });
  });

  describe('structure validation - GROQ type schema', () => {
    it('rejects GROQ type missing name', async () => {
      const loader = new SchemaLoader();

      const invalidSchema = [{ name: 'valid', type: 'document', attributes: {} }, { type: 'document', attributes: {} }];

      const filePath = writeTempSchema(invalidSchema);
      const result = await loader.loadFromPath(filePath);

      expect(result).toBe(false);
      expect(loader.getLastValidationError()).toContain('missing required "name"');
    });

    it('rejects GROQ type missing type field', async () => {
      const loader = new SchemaLoader();

      const invalidSchema = [{ name: 'valid', type: 'document', attributes: {} }, { name: 'invalid', attributes: {} }];

      const filePath = writeTempSchema(invalidSchema);
      const result = await loader.loadFromPath(filePath);

      expect(result).toBe(false);
      expect(loader.getLastValidationError()).toContain('missing required "type"');
    });

    it('accepts valid GROQ type schema as array', async () => {
      const loader = new SchemaLoader();

      const validSchema = [
        { name: 'test', type: 'document', attributes: {} },
      ];

      const filePath = writeTempSchema(validSchema);
      const result = await loader.loadFromPath(filePath);

      expect(result).toBe(true);
    });

    it('accepts valid GROQ type schema as object', async () => {
      const loader = new SchemaLoader();

      const validSchema = {
        test: { name: 'test', type: 'document', attributes: {} },
      };

      const filePath = writeTempSchema(validSchema);
      const result = await loader.loadFromPath(filePath);

      expect(result).toBe(true);
    });
  });

  describe('unrecognized schema format', () => {
    it('rejects schema that matches neither format', async () => {
      const loader = new SchemaLoader();

      const invalidSchema = { randomKey: 'randomValue' };

      const filePath = writeTempSchema(invalidSchema);
      const result = await loader.loadFromPath(filePath);

      expect(result).toBe(false);
      expect(loader.getLastValidationError()).toContain('does not match expected');
    });

    it('rejects empty array', async () => {
      const loader = new SchemaLoader();

      const filePath = writeTempSchema([]);
      const result = await loader.loadFromPath(filePath);

      expect(result).toBe(false);
      expect(loader.getLastValidationError()).toContain('does not match expected');
    });

    it('rejects primitive values', async () => {
      const loader = new SchemaLoader();

      const filePath = writeTempSchema('just a string');
      const result = await loader.loadFromPath(filePath);

      expect(result).toBe(false);
      expect(loader.getLastValidationError()).toContain('does not match expected');
    });
  });

  describe('validation disabled', () => {
    it('bypasses all validation when disabled', async () => {
      const loader = new SchemaLoader({ enabled: false });

      const invalidSchema = { randomKey: 'randomValue' };

      const filePath = writeTempSchema(invalidSchema);
      const result = await loader.loadFromPath(filePath);

      expect(result).toBe(true);
      expect(loader.getLastValidationError()).toBeNull();
    });

    it('loads deeply nested schema when validation disabled', async () => {
      const loader = new SchemaLoader({ enabled: false, maxDepth: 1 });

      const deepSchema = {
        types: [{
          name: 'test',
          type: 'document',
          deep: { nested: { object: { here: true } } },
        }],
      };

      const filePath = writeTempSchema(deepSchema);
      const result = await loader.loadFromPath(filePath);

      expect(result).toBe(true);
    });
  });

  describe('getLastValidationError', () => {
    it('returns null after successful load', async () => {
      const loader = new SchemaLoader();

      const validSchema = {
        types: [{ name: 'test', type: 'document' }],
      };

      const filePath = writeTempSchema(validSchema);
      await loader.loadFromPath(filePath);

      expect(loader.getLastValidationError()).toBeNull();
    });

    it('returns error message after failed validation', async () => {
      const loader = new SchemaLoader({ maxTypes: 1 });

      const invalidSchema = {
        types: [
          { name: 'type1', type: 'document' },
          { name: 'type2', type: 'document' },
        ],
      };

      const filePath = writeTempSchema(invalidSchema);
      await loader.loadFromPath(filePath);

      expect(loader.getLastValidationError()).not.toBeNull();
      expect(typeof loader.getLastValidationError()).toBe('string');
    });

    it('clears error on subsequent successful load', async () => {
      const loader = new SchemaLoader({ maxTypes: 1 });

      const invalidSchema = {
        types: [
          { name: 'type1', type: 'document' },
          { name: 'type2', type: 'document' },
        ],
      };

      const validSchema = {
        types: [{ name: 'type1', type: 'document' }],
      };

      const invalidPath = writeTempSchema(invalidSchema);
      await loader.loadFromPath(invalidPath);
      expect(loader.getLastValidationError()).not.toBeNull();

      const validPath = path.join(tempDir, 'valid-schema.json');
      fs.writeFileSync(validPath, JSON.stringify(validSchema));
      await loader.loadFromPath(validPath);
      expect(loader.getLastValidationError()).toBeNull();
    });

    it('is cleared by clear()', async () => {
      const loader = new SchemaLoader({ maxTypes: 1 });

      const invalidSchema = {
        types: [
          { name: 'type1', type: 'document' },
          { name: 'type2', type: 'document' },
        ],
      };

      const filePath = writeTempSchema(invalidSchema);
      await loader.loadFromPath(filePath);
      expect(loader.getLastValidationError()).not.toBeNull();

      loader.clear();
      expect(loader.getLastValidationError()).toBeNull();
    });
  });

  describe('valid schema loading', () => {
    it('loads and resolves valid Sanity schema', async () => {
      const loader = new SchemaLoader();

      const validSchema = {
        types: [
          {
            name: 'post',
            type: 'document',
            fields: [
              { name: 'title', type: 'string' },
              { name: 'body', type: 'text' },
            ],
          },
          {
            name: 'author',
            type: 'document',
            fields: [{ name: 'name', type: 'string' }],
          },
        ],
      };

      const filePath = writeTempSchema(validSchema);
      const result = await loader.loadFromPath(filePath);

      expect(result).toBe(true);
      expect(loader.isLoaded()).toBe(true);
      expect(loader.getTypeNames()).toContain('post');
      expect(loader.getTypeNames()).toContain('author');
      expect(loader.getFieldsForType('post')).toHaveLength(7);
    });

    it('loads and resolves valid GROQ type schema', async () => {
      const loader = new SchemaLoader();

      const validSchema = [
        {
          name: 'post',
          type: 'document',
          attributes: {
            title: { type: 'objectAttribute', value: { type: 'string' } },
          },
        },
      ];

      const filePath = writeTempSchema(validSchema);
      const result = await loader.loadFromPath(filePath);

      expect(result).toBe(true);
      expect(loader.isLoaded()).toBe(true);
      expect(loader.getTypeNames()).toContain('post');
    });
  });

  describe('validation caching', () => {
    function getCachePath(schemaPath: string): string {
      const dir = path.dirname(schemaPath);
      const basename = path.basename(schemaPath, path.extname(schemaPath));
      return path.join(dir, `.${basename}.groq-cache`);
    }

    it('creates cache file after first validation', async () => {
      const loader = new SchemaLoader({ cacheValidation: true });

      const validSchema = {
        types: [{ name: 'test', type: 'document' }],
      };

      const filePath = writeTempSchema(validSchema);
      const cachePath = getCachePath(filePath);

      expect(fs.existsSync(cachePath)).toBe(false);

      await loader.loadFromPath(filePath);

      expect(fs.existsSync(cachePath)).toBe(true);
    });

    it('skips validation on cache hit', async () => {
      const loader = new SchemaLoader({ cacheValidation: true });

      const validSchema = {
        types: [{ name: 'test', type: 'document' }],
      };

      const filePath = writeTempSchema(validSchema);

      await loader.loadFromPath(filePath);

      const cacheContent = fs.readFileSync(getCachePath(filePath), 'utf-8');
      const cache = JSON.parse(cacheContent);
      expect(cache.valid).toBe(true);

      const result = await loader.loadFromPath(filePath);
      expect(result).toBe(true);
    });

    it('returns cached validation error', async () => {
      const loader = new SchemaLoader({ maxTypes: 1, cacheValidation: true });

      const invalidSchema = {
        types: [
          { name: 'type1', type: 'document' },
          { name: 'type2', type: 'document' },
        ],
      };

      const filePath = writeTempSchema(invalidSchema);

      await loader.loadFromPath(filePath);
      expect(loader.getLastValidationError()).toContain('2 types');

      loader.clear();
      const result = await loader.loadFromPath(filePath);
      expect(result).toBe(false);
      expect(loader.getLastValidationError()).toContain('cached');
    });

    it('invalidates cache when schema changes', async () => {
      const loader = new SchemaLoader({ cacheValidation: true });

      const schema1 = {
        types: [{ name: 'test1', type: 'document' }],
      };

      const filePath = writeTempSchema(schema1);

      await loader.loadFromPath(filePath);
      expect(loader.getTypeNames()).toContain('test1');

      const schema2 = {
        types: [{ name: 'test2', type: 'document' }],
      };
      fs.writeFileSync(filePath, JSON.stringify(schema2));

      await loader.loadFromPath(filePath);
      expect(loader.getTypeNames()).toContain('test2');
      expect(loader.getTypeNames()).not.toContain('test1');
    });

    it('invalidates cache when validation config changes', async () => {
      const loader = new SchemaLoader({ maxTypes: 100, cacheValidation: true });

      const schema = {
        types: [
          { name: 'type1', type: 'document' },
          { name: 'type2', type: 'document' },
        ],
      };

      const filePath = writeTempSchema(schema);

      await loader.loadFromPath(filePath);
      expect(loader.isLoaded()).toBe(true);

      loader.updateValidationConfig({ maxTypes: 1 });
      loader.clear();

      const result = await loader.loadFromPath(filePath);
      expect(result).toBe(false);
      expect(loader.getLastValidationError()).toContain('2 types');
    });

    it('does not create cache when caching disabled', async () => {
      const loader = new SchemaLoader({ cacheValidation: false });

      const validSchema = {
        types: [{ name: 'test', type: 'document' }],
      };

      const filePath = writeTempSchema(validSchema);
      const cachePath = getCachePath(filePath);

      await loader.loadFromPath(filePath);

      expect(fs.existsSync(cachePath)).toBe(false);
    });

    it('clearValidationCache removes cache file', async () => {
      const loader = new SchemaLoader({ cacheValidation: true });

      const validSchema = {
        types: [{ name: 'test', type: 'document' }],
      };

      const filePath = writeTempSchema(validSchema);
      const cachePath = getCachePath(filePath);

      await loader.loadFromPath(filePath);
      expect(fs.existsSync(cachePath)).toBe(true);

      loader.clearValidationCache();
      expect(fs.existsSync(cachePath)).toBe(false);
    });

    it('clearValidationCache with explicit path', async () => {
      const loader = new SchemaLoader({ cacheValidation: true });

      const validSchema = {
        types: [{ name: 'test', type: 'document' }],
      };

      const filePath = writeTempSchema(validSchema);
      const cachePath = getCachePath(filePath);

      await loader.loadFromPath(filePath);
      expect(fs.existsSync(cachePath)).toBe(true);

      const newLoader = new SchemaLoader();
      newLoader.clearValidationCache(filePath);
      expect(fs.existsSync(cachePath)).toBe(false);
    });

    it('handles corrupted cache file gracefully', async () => {
      const loader = new SchemaLoader({ cacheValidation: true });

      const validSchema = {
        types: [{ name: 'test', type: 'document' }],
      };

      const filePath = writeTempSchema(validSchema);
      const cachePath = getCachePath(filePath);

      fs.writeFileSync(cachePath, 'not valid json');

      const result = await loader.loadFromPath(filePath);
      expect(result).toBe(true);
      expect(loader.isLoaded()).toBe(true);
    });

    it('handles cache with wrong version', async () => {
      const loader = new SchemaLoader({ cacheValidation: true });

      const validSchema = {
        types: [{ name: 'test', type: 'document' }],
      };

      const filePath = writeTempSchema(validSchema);
      const cachePath = getCachePath(filePath);

      fs.writeFileSync(cachePath, JSON.stringify({
        version: 9999,
        schemaHash: 'abc',
        configHash: 'def',
        valid: false,
        error: 'should be ignored',
      }));

      const result = await loader.loadFromPath(filePath);
      expect(result).toBe(true);
    });

    it('default config has caching enabled', () => {
      const loader = new SchemaLoader();
      expect(loader.getValidationConfig().cacheValidation).toBe(true);
    });
  });
});
