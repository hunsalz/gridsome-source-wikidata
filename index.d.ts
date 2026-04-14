import { SourcePluginApi } from "gridsome";

/**
 * Options for the gridsome-source-wikidata plugin
 */
export interface WikidataSourceOptions {
  /** SPARQL endpoint URL (required) */
  url: string;
  /** SPARQL query string (required) */
  sparql: string;
  /** GraphQL type name for the collection (required) */
  typeName: string;
  /** Base directory for downloaded files (default: "/content/") */
  baseDir?: string;
  /** Cache filename (default: ".cache.json") */
  cacheFilename?: string;
  /** Enable/disable caching (default: true) */
  cacheEnabled?: boolean;
  /** Cache TTL in milliseconds (default: 24 hours) */
  ttl?: number;
  /** HTTP request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Maximum file size in bytes (default: 104857600 = 100 MB) */
  maxFileSize?: number;
  /** Array of allowed file extensions (e.g., ['jpg', 'png', 'pdf']). If undefined, all types are allowed. */
  allowedFileTypes?: string[];
  /** Delay in milliseconds between requests to prevent hitting API rate limits (default: 100). Set to 0 to disable. */
  rateLimitDelay?: number;
  /** Maximum number of retries for transient network errors (default: 2) */
  maxRetries?: number;
  /** Initial delay in milliseconds for retries with exponential backoff (default: 1000) */
  retryDelay?: number;
  /** Enable verbose logging (default: false) */
  verbose?: boolean;
}

/**
 * Gridsome Actions API for data store operations
 * Used within the loadSource hook
 */
export interface ActionsAPI {
  /**
   * Add a new collection to the data store
   * @param options Collection options with typeName
   * @returns Collection instance for adding nodes
   */
  addCollection(options: { typeName: string }): Collection;
  /**
   * Get an existing collection by type name
   * @param typeName The GraphQL schema type name
   * @returns Collection instance or undefined if not found
   */
  getCollection(typeName: string): Collection | undefined;
}

/**
 * Collection instance for adding nodes to a GraphQL collection
 */
export interface Collection {
  /**
   * Add a node to the collection
   * @param node Node data object (must include an 'id' field or Gridsome will generate one)
   * @returns The added node
   */
  addNode(node: Record<string, any>): any;
}

/**
 * Gridsome source plugin for Wikidata
 * Fetches data from Wikidata SPARQL endpoint and downloads associated media files
 */
declare class SourcePlugin {
  /**
   * Creates a new SourcePlugin instance
   * @param api Gridsome SourcePluginApi instance
   * @param options Plugin configuration options
   */
  constructor(api: SourcePluginApi, options: WikidataSourceOptions);
}

export declare const defaults: {
  baseDir: string;
  cacheFilename: string;
  cacheEnabled: boolean;
  ttl: number;
  timeout: number;
  maxFileSize: number;
  allowedFileTypes: undefined;
  rateLimitDelay: number;
  maxRetries: number;
  retryDelay: number;
  verbose: boolean;
};

export default SourcePlugin;
