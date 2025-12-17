import { describe, it, expect } from 'vitest';
import { ClickHouseConnector } from '../../src/connectors/clickhouse.js';
import { OpenGaussConnector } from '../../src/connectors/opengauss.js';
import type { ClickHouseConfig, OpenGaussConfig } from '../../src/types/schema.js';

describe('LIKE Pattern Escaping Security Tests', () => {
  describe('ClickHouse escapeLikePattern', () => {
    it('should escape percent signs', () => {
      const connector = new ClickHouseConnector({
        type: 'clickhouse',
        host: 'localhost',
        database: 'test',
      } as ClickHouseConfig);

      // Access private method via type assertion for testing
      const escapeLikePattern = (connector as any).escapeLikePattern.bind(connector);

      const result = escapeLikePattern('user%name');
      expect(result).toBe('user\\%name');
    });

    it('should escape underscores', () => {
      const connector = new ClickHouseConnector({
        type: 'clickhouse',
        host: 'localhost',
        database: 'test',
      } as ClickHouseConfig);

      const escapeLikePattern = (connector as any).escapeLikePattern.bind(connector);

      const result = escapeLikePattern('user_id');
      expect(result).toBe('user\\_id');
    });

    it('should escape backslashes', () => {
      const connector = new ClickHouseConnector({
        type: 'clickhouse',
        host: 'localhost',
        database: 'test',
      } as ClickHouseConfig);

      const escapeLikePattern = (connector as any).escapeLikePattern.bind(connector);

      const result = escapeLikePattern('path\\to\\file');
      expect(result).toBe('path\\\\to\\\\file');
    });

    it('should escape multiple special characters', () => {
      const connector = new ClickHouseConnector({
        type: 'clickhouse',
        host: 'localhost',
        database: 'test',
      } as ClickHouseConfig);

      const escapeLikePattern = (connector as any).escapeLikePattern.bind(connector);

      const result = escapeLikePattern('user%_id\\test');
      expect(result).toBe('user\\%\\_id\\\\test');
    });

    it('should handle empty string', () => {
      const connector = new ClickHouseConnector({
        type: 'clickhouse',
        host: 'localhost',
        database: 'test',
      } as ClickHouseConfig);

      const escapeLikePattern = (connector as any).escapeLikePattern.bind(connector);

      const result = escapeLikePattern('');
      expect(result).toBe('');
    });

    it('should handle string without special characters', () => {
      const connector = new ClickHouseConnector({
        type: 'clickhouse',
        host: 'localhost',
        database: 'test',
      } as ClickHouseConfig);

      const escapeLikePattern = (connector as any).escapeLikePattern.bind(connector);

      const result = escapeLikePattern('username');
      expect(result).toBe('username');
    });
  });

  describe('OpenGauss escapeLikePattern', () => {
    it('should escape percent signs', () => {
      const connector = new OpenGaussConnector({
        type: 'opengauss',
        host: 'localhost',
        database: 'test',
      } as OpenGaussConfig);

      const escapeLikePattern = (connector as any).escapeLikePattern.bind(connector);

      const result = escapeLikePattern('user%name');
      expect(result).toBe('user\\%name');
    });

    it('should escape underscores', () => {
      const connector = new OpenGaussConnector({
        type: 'opengauss',
        host: 'localhost',
        database: 'test',
      } as OpenGaussConfig);

      const escapeLikePattern = (connector as any).escapeLikePattern.bind(connector);

      const result = escapeLikePattern('user_id');
      expect(result).toBe('user\\_id');
    });

    it('should escape backslashes', () => {
      const connector = new OpenGaussConnector({
        type: 'opengauss',
        host: 'localhost',
        database: 'test',
      } as OpenGaussConfig);

      const escapeLikePattern = (connector as any).escapeLikePattern.bind(connector);

      const result = escapeLikePattern('path\\to\\file');
      expect(result).toBe('path\\\\to\\\\file');
    });

    it('should escape multiple special characters', () => {
      const connector = new OpenGaussConnector({
        type: 'opengauss',
        host: 'localhost',
        database: 'test',
      } as OpenGaussConfig);

      const escapeLikePattern = (connector as any).escapeLikePattern.bind(connector);

      const result = escapeLikePattern('user%_id\\test');
      expect(result).toBe('user\\%\\_id\\\\test');
    });
  });

  describe('Pattern Matching Behavior', () => {
    it('should explain wildcard issue without escaping', () => {
      // This test documents the problem we're fixing
      // Without escaping:
      // - Searching for "user%id" would match "user123id", "userid", "usernameid"
      // - Searching for "user_id" would match "user1id", "user2id", "useraid"
      //
      // With escaping:
      // - Searching for "user%id" only matches columns literally named "user%id"
      // - Searching for "user_id" only matches columns literally named "user_id"

      expect(true).toBe(true); // Placeholder - actual behavior tested with real DB
    });
  });

  describe('Security Scenarios', () => {
    it('should prevent unintended wildcard matching for percent sign', () => {
      const connector = new ClickHouseConnector({
        type: 'clickhouse',
        host: 'localhost',
        database: 'test',
      } as ClickHouseConfig);

      const escapeLikePattern = (connector as any).escapeLikePattern.bind(connector);

      // User searches for "discount%"
      // Without escaping: would match "discount", "discount_rate", "discount_amount"
      // With escaping: only matches columns with literal "discount%" in name
      const userInput = 'discount%';
      const escaped = escapeLikePattern(userInput);

      expect(escaped).toBe('discount\\%');
      // When used in query: WHERE column_name ILIKE '%discount\%%' ESCAPE '\\'
      // This will only match columns containing the literal string "discount%"
    });

    it('should prevent unintended wildcard matching for underscore', () => {
      const connector = new OpenGaussConnector({
        type: 'opengauss',
        host: 'localhost',
        database: 'test',
      } as OpenGaussConfig);

      const escapeLikePattern = (connector as any).escapeLikePattern.bind(connector);

      // User searches for "user_id"
      // Without escaping: would match "user1id", "user2id", "userid"
      // With escaping: only matches columns with literal "user_id" in name
      const userInput = 'user_id';
      const escaped = escapeLikePattern(userInput);

      expect(escaped).toBe('user\\_id');
      // When used in query: WHERE column_name ILIKE '%user\_id%' ESCAPE '\'
      // This will only match columns containing the literal string "user_id"
    });

    it('should handle malicious input with multiple wildcards', () => {
      const connector = new ClickHouseConnector({
        type: 'clickhouse',
        host: 'localhost',
        database: 'test',
      } as ClickHouseConfig);

      const escapeLikePattern = (connector as any).escapeLikePattern.bind(connector);

      // Malicious user tries to match everything with "%%%___"
      // Without escaping: would match almost any column name
      // With escaping: only matches columns with these exact characters
      const maliciousInput = '%%%___';
      const escaped = escapeLikePattern(maliciousInput);

      expect(escaped).toBe('\\%\\%\\%\\_\\_\\_');
    });
  });
});
