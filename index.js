const HttpProxy = require("./httpProxy.js");
const path = require("path");

// Constants
const ONE_HOUR_MS = 60 * 60 * 1000;
const DEFAULT_TTL_MS = 24 * ONE_HOUR_MS; // 24 hours
const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds
const DEFAULT_MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
const DEFAULT_RATE_LIMIT_DELAY_MS = 100; // 100ms delay between requests

/**
 * Gridsome source plugin for Wikidata
 * Fetches data from Wikidata SPARQL endpoint and downloads associated media files
 */
class SourcePlugin {
  /**
   * Creates a new SourcePlugin instance
   * @param {Object} api - Gridsome API instance
   * @param {Object} options - Plugin options
   * @param {string} options.url - SPARQL endpoint URL (required)
   * @param {string} options.sparql - SPARQL query string (required)
   * @param {string} options.typeName - GraphQL type name for the collection (required)
   * @param {string} [options.baseDir="/content/"] - Base directory for downloaded files
   * @param {string} [options.cacheFilename=".cache.json"] - Cache filename
   * @param {boolean} [options.cacheEnabled=true] - Enable/disable caching
   * @param {number} [options.ttl] - Cache TTL in milliseconds (default: 24h)
   * @param {number} [options.timeout=30000] - HTTP request timeout in milliseconds
   * @param {number} [options.maxFileSize] - Maximum file size in bytes (default: 100MB)
   * @param {string[]} [options.allowedFileTypes] - Array of allowed file extensions (e.g., ['jpg', 'png', 'pdf']). If undefined, all types are allowed.
   * @param {number} [options.rateLimitDelay] - Delay in milliseconds between requests (default: 100ms). Set to 0 to disable rate limiting.
   * @param {boolean} [options.verbose=false] - Enable verbose logging
   */
  constructor(api, options) {
    // combine options with defaults
    this._options = exports.defaults;
    this._options = Object.assign({}, this._options, options);

    // Validate mandatory options
    this._validateOptions();

    // init HttpProxy
    this._proxy = new HttpProxy({
      baseDir: this._options.baseDir,
      cacheFilename: this._options.cacheFilename,
      cacheEnabled: this._options.cacheEnabled,
      ttl: this._options.ttl,
      timeout: this._options.timeout,
      maxFileSize: this._options.maxFileSize,
      allowedFileTypes: this._options.allowedFileTypes,
      rateLimitDelay: this._options.rateLimitDelay,
      verbose: this._options.verbose
    });

    // start processing
    api.loadSource(async (actions) => {
      try {
        // fetch data ...
        const downloads = await this.fetchWikidata(actions);
        // download remote URIs ...
        this.info("Starting media download(s) ...");
        await this._proxy.download(downloads);
      } catch (error) {
        console.error("gridsome-source-wikidata: Failed to load source", error);
        throw error;
      }
    });
  }

  async fetchWikidata(actions) {
    const collection = actions.addCollection({
      typeName: this._options.typeName
    });
    const downloads = [];
    // Validate and resolve baseDir to prevent path traversal
    // If baseDir starts with "/", treat as absolute path from project root
    // Otherwise, treat as relative to project root
    const resolvedBaseDir = this._options.baseDir.startsWith("/")
      ? path.resolve(process.cwd(), this._options.baseDir.slice(1)) // Remove leading / and resolve
      : path.resolve(process.cwd(), this._options.baseDir);
    // Ensure the resolved path is within the project directory
    const projectRoot = path.resolve(process.cwd());
    if (!resolvedBaseDir.startsWith(projectRoot)) {
      throw new Error(
        `Invalid baseDir: path must be within project directory. Got: ${this._options.baseDir}`
      );
    }
    const fileDir = resolvedBaseDir + path.sep;
    const url = this._options.url + "?query=" + encodeURIComponent(this._options.sparql);
    // fetch Wikidata and process items
    this.info("Fetching Wikidata ...");
    try {
      const response = await this._proxy.fetchJson(url);
      // process each item
      if (response && response.results && response.results.bindings) {
        response.results.bindings.forEach((item) => {
          // inspect & rewrite item properties
          Object.keys(item).forEach((property) => {
            // rewrite URI with the later download file reference
            if (item[property].type === "uri") {
              const uri = item[property].value;
              // Extract filename using path module for better handling
              let filename;
              try {
                const uriPath = new URL(uri).pathname;
                filename = path.basename(uriPath);
              } catch (error) {
                // Fallback for non-URL URIs (e.g., relative paths)
                filename = uri.substring(uri.lastIndexOf("/") + 1);
              }
              filename = decodeURIComponent(filename).replace(/%2C/g, ",");
              downloads.push({
                uri: uri,
                fileDir: fileDir,
                filename: filename
              });
              // rewrite value with absolute local file path
              item[property].value = fileDir + filename;
            }
            // flatten objects by extracting values only
            item[property] = item[property].value;
          });
          // Ensure node has an ID for Gridsome
          // Gridsome will use 'id' field if present, otherwise generates from first field
          // If 'item' field exists (common in SPARQL queries), use it as ID
          if (!item.id && item.item) {
            item.id = item.item;
          }
          // add collection
          collection.addNode(item);
        });
      }
    } catch (error) {
      console.error("Fetching Wikidata failed!", error);
      throw new Error(`Failed to fetch Wikidata: ${error.message}`);
    }
    return downloads;
  }

  /**
   * Validates plugin options
   * @private
   * @throws {Error} If required options are missing or invalid
   */
  _validateOptions() {
    // Validate URL
    if (!this._options.url) {
      throw new Error(`Missing 'url' endpoint. Please provide a valid url endpoint.`);
    }
    try {
      new URL(this._options.url);
    } catch (error) {
      throw new Error(
        `Invalid 'url' format. Please provide a valid URL. Got: ${this._options.url}`
      );
    }

    // Validate SPARQL query
    if (!this._options.sparql) {
      throw new Error(`Missing 'sparql' query. Please provide a valid sparql query.`);
    }
    if (typeof this._options.sparql !== "string" || this._options.sparql.trim().length === 0) {
      throw new Error(`Invalid 'sparql' query. Must be a non-empty string.`);
    }
    // Basic SPARQL validation - should contain SELECT, WHERE, or ASK
    const sparqlUpper = this._options.sparql.toUpperCase();
    if (
      !sparqlUpper.includes("SELECT") &&
      !sparqlUpper.includes("ASK") &&
      !sparqlUpper.includes("CONSTRUCT") &&
      !sparqlUpper.includes("DESCRIBE")
    ) {
      throw new Error(
        `Invalid 'sparql' query. Must be a valid SPARQL query (SELECT, ASK, CONSTRUCT, or DESCRIBE).`
      );
    }

    // Validate typeName (GraphQL type names must start with uppercase letter and contain only alphanumeric)
    if (!this._options.typeName) {
      throw new Error(`Missing 'typeName' label. Please provide a type name label.`);
    }
    if (!/^[A-Z][a-zA-Z0-9]*$/.test(this._options.typeName)) {
      throw new Error(
        `Invalid 'typeName' format. Must be a valid GraphQL type name (start with uppercase letter, alphanumeric only). Got: ${this._options.typeName}`
      );
    }

    // Validate baseDir
    if (this._options.baseDir && typeof this._options.baseDir !== "string") {
      throw new Error(
        `Invalid 'baseDir' format. Must be a string. Got: ${typeof this._options.baseDir}`
      );
    }
  }

  /**
   * Logs info message if verbose mode is enabled
   * @param {...any} msgs - Messages to log
   */
  info(...msgs) {
    if (this._options.verbose) console.log(...msgs);
  }

  /**
   * Logs warning message if verbose mode is enabled
   * @param {...any} msgs - Messages to log
   */
  warn(...msgs) {
    if (this._options.verbose) console.warn(...msgs);
  }
}

exports.defaults = {
  baseDir: "/content/",
  cacheFilename: ".cache.json",
  cacheEnabled: true,
  ttl: DEFAULT_TTL_MS,
  timeout: DEFAULT_TIMEOUT_MS,
  maxFileSize: DEFAULT_MAX_FILE_SIZE,
  allowedFileTypes: undefined, // undefined = allow all file types
  rateLimitDelay: DEFAULT_RATE_LIMIT_DELAY_MS,
  verbose: false
};

module.exports = SourcePlugin;
