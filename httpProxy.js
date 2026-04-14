import got from "got";
import fs from "fs-extra";
import path from "path";
import revisionHash from "rev-hash";
import cliProgress from "cli-progress";

// Constants
const ONE_HOUR_MS = 60 * 60 * 1000;
const DEFAULT_TTL_MS = 24 * ONE_HOUR_MS; // 24 hours
const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds
const DEFAULT_MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
const MB = 1024 * 1024;
const DEFAULT_RATE_LIMIT_DELAY_MS = 100; // 100ms delay between requests
const CACHE_SAVE_DEBOUNCE_MS = 1000; // 1 second debounce for cache saves
const DEFAULT_MAX_RETRIES = 2; // Retry up to 2 times on network errors
const DEFAULT_RETRY_DELAY_MS = 1000; // Initial retry delay (exponential backoff applied)

const multibar = new cliProgress.MultiBar(
  {
    format: "Loading [{bar}] {filename} | {duration}sec | {value}/{total} Bytes",
    stopOnComplete: true,
    clearOnComplete: false,
    hideCursor: true
  },
  cliProgress.Presets.shades_grey
);

export const defaults = {
  baseDir: "/content/",
  cacheFilename: ".cache.json",
  cacheEnabled: true,
  ttl: DEFAULT_TTL_MS,
  timeout: DEFAULT_TIMEOUT_MS,
  maxFileSize: DEFAULT_MAX_FILE_SIZE,
  allowedFileTypes: undefined, // undefined = allow all file types
  rateLimitDelay: DEFAULT_RATE_LIMIT_DELAY_MS,
  maxRetries: DEFAULT_MAX_RETRIES,
  retryDelay: DEFAULT_RETRY_DELAY_MS,
  verbose: false
};

/**
 * Checks if a value is a number
 * @param {*} val - Value to check
 * @returns {boolean} True if value is a number
 */
function isNumber(val) {
  return typeof val === "number";
}

/**
 * Checks if an error is retriable (transient network error)
 * @param {Error} error - The error to check
 * @returns {boolean} True if the error is retriable
 */
function isRetriableError(error) {
  if (!error || !error.code) return false;
  // Network timeouts and connection errors are retriable
  return (
    error.code === "ETIMEDOUT" ||
    error.code === "ECONNRESET" ||
    error.code === "ECONNREFUSED" ||
    error.code === "ERR_HTTP2_STREAM_CANCEL" ||
    (error.response && error.response.status >= 500) // Server errors are retriable
  );
}

/**
 * Retries an async operation with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} retryDelay - Initial delay in ms (exponential backoff applied)
 * @param {Function} [shouldRetry] - Optional function to determine if error is retriable
 * @returns {Promise} Result of the async operation
 */
async function retryWithBackoff(
  fn,
  maxRetries = 0,
  retryDelay = 0,
  shouldRetry = isRetriableError
) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries && shouldRetry(error)) {
        const delay = retryDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
  throw lastError;
}

/**
 * HTTP proxy for fetching and caching remote resources
 * Handles file downloads, caching, and progress tracking
 */
class HttpProxy {
  /**
   * Creates a new HttpProxy instance
   * @param {Object} options - Configuration options
   * @param {string} [options.baseDir="/content/"] - Base directory for files
   * @param {string} [options.cacheFilename=".cache.json"] - Cache filename
   * @param {boolean} [options.cacheEnabled=true] - Enable/disable caching
   * @param {number} [options.ttl] - Cache TTL in milliseconds
   * @param {number} [options.timeout=30000] - HTTP request timeout in milliseconds
   * @param {number} [options.maxFileSize] - Maximum file size in bytes (default: 100MB)
   * @param {string[]} [options.allowedFileTypes] - Array of allowed file extensions. If undefined, all types are allowed.
   * @param {number} [options.rateLimitDelay] - Delay in milliseconds between requests (default: 100ms). Set to 0 to disable.
   * @param {boolean} [options.verbose=false] - Enable verbose logging
   */
  constructor(options) {
    // combine options with defaults
    this._options = Object.assign({}, defaults, options);
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
    // define working directory
    this._options.workDir = resolvedBaseDir + path.sep;
    // ensure that workDir exists
    fs.ensureDirSync(this._options.workDir);
    // Initialize cache (will be loaded asynchronously)
    this._cache = new Map();
    this._cacheSaveTimer = null;
    this._lastRequestTime = 0;
    // lookup cache file asynchronously (non-blocking)
    this.readCacheFile().catch((err) => {
      // If async read fails, cache will remain empty
      // Always warn about cache read failures (not just in verbose mode)
      // as this could indicate data loss
      console.warn(
        `gridsome-source-wikidata: Failed to read cache file: ${err.message}. Cache will be initialized empty.`
      );
    });
  }

  /**
   * Fetches JSON data from URL with caching support and rate limiting
   * @param {string} url - URL to fetch
   * @returns {Promise<Object>} Parsed JSON response
   */
  async fetchJson(url) {
    // lookup URL from cache
    const data = this.get(url);
    if (data) {
      this.info(`Cache hit for ${url}`);
      return JSON.parse(data);
    }
    // Apply rate limiting
    await this._applyRateLimit();
    // otherwise fetch data from URL with retries
    const json = await got(url, {
      headers: { Accept: "application/sparql-results+json" },
      timeout: {
        request: this._options.timeout || DEFAULT_TIMEOUT_MS
      },
      retry: {
        limit: this._options.maxRetries || DEFAULT_MAX_RETRIES,
        statusCodes: [408, 413, 429, 500, 502, 503, 504, 521, 522, 524],
        methods: ["GET"]
      },
      hooks: {
        beforeRetry: [
          ({ response, retryCount }) => {
            if (response?.statusCode === 429) {
              const retryAfter = response.headers["retry-after"];
              const delay = retryAfter
                ? parseInt(retryAfter, 10) * 1000
                : (this._options.retryDelay || DEFAULT_RETRY_DELAY_MS) * 2 ** retryCount;
              return new Promise((resolve) => setTimeout(resolve, delay));
            }
          }
        ]
      }
    }).json();
    // save json to disk
    const hash = revisionHash(url);
    const filePath = this.getPath(hash);
    await this.saveFile(filePath, JSON.stringify(json));
    await this.set(hash, filePath, this._options.ttl);
    // return json
    return json;
  }

  /**
   * Gets file path for cached or new file
   * @param {string} hash - File hash
   * @param {string} [type="json"] - File type/extension
   * @returns {string} File path
   */
  getPath(hash, type = "json") {
    const data = this._cache.get(hash);
    if (data) {
      return data.path;
    } else {
      return `${this._options.workDir}file${this._cache.size}.${type}`;
    }
  }

  /**
   * Reads file synchronously
   * @param {string} path - File path
   * @returns {Buffer|undefined} File contents or undefined if error
   */
  readFile(path) {
    try {
      return fs.readFileSync(path);
    } catch (err) {
      return;
    }
  }

  /**
   * Saves content to file
   * @param {string} path - File path
   * @param {string} value - Content to save
   * @returns {Promise<void>}
   */
  saveFile(path, value) {
    return new Promise((resolve, reject) => {
      fs.outputFile(path, value, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Downloads multiple files in parallel
   * @param {Array<Object>} downloads - Array of download objects with uri, fileDir, filename
   * @returns {Promise<void>}
   */
  async download(downloads) {
    await Promise.all(
      downloads.map((download) =>
        this.save2disk(download.uri, download.fileDir, download.filename).catch((error) =>
          console.error(
            `Saving ${download.uri} to ${download.fileDir}${download.filename} failed: ${error}`
          )
        )
      )
    );
    // finally stop any progress bar
    multibar.stop();
  }

  /**
   * Downloads and saves a file to disk with caching support and rate limiting
   * @param {string} url - URL to download
   * @param {string} fileDir - Target directory
   * @param {string} filename - Target filename
   * @returns {Promise<void>}
   */
  async save2disk(url, fileDir, filename) {
    // lookup URL from cache
    const data = this.get(url);
    if (data) {
      this.info(`Cache hit for ${url}`);
      return data;
    }
    // Apply rate limiting
    await this._applyRateLimit();
    // otherwise fetch data from URL
    let bar;
    // create write stream - validate path to prevent traversal
    const filePath = path.resolve(fileDir, filename);
    // Ensure the file path is within the fileDir
    if (!filePath.startsWith(path.resolve(fileDir))) {
      throw new Error(`Invalid filename: path traversal detected. Filename: ${filename}`);
    }

    // Validate file type if allowedFileTypes is specified
    if (this._options.allowedFileTypes && this._options.allowedFileTypes.length > 0) {
      const fileExt = path.extname(filename).toLowerCase().slice(1); // Remove the dot
      if (!this._options.allowedFileTypes.includes(fileExt)) {
        throw new Error(
          `File type not allowed: ${fileExt}. Allowed types: ${this._options.allowedFileTypes.join(", ")}`
        );
      }
    }

    const maxFileSize = this._options.maxFileSize || DEFAULT_MAX_FILE_SIZE;
    let totalBytesReceived = 0;

    const writer = fs.createWriteStream(filePath);
    // start request — got handles retries (including 429 + Retry-After) internally
    const response = got.stream(url, {
      timeout: {
        request: this._options.timeout || DEFAULT_TIMEOUT_MS
      },
      retry: {
        limit: this._options.maxRetries || DEFAULT_MAX_RETRIES,
        statusCodes: [408, 413, 429, 500, 502, 503, 504, 521, 522, 524],
        methods: ["GET"]
      },
      hooks: {
        beforeRetry: [
          ({ response: res, retryCount }) => {
            if (res?.statusCode === 429) {
              const retryAfter = res.headers["retry-after"];
              const delay = retryAfter
                ? parseInt(retryAfter, 10) * 1000
                : (this._options.retryDelay || DEFAULT_RETRY_DELAY_MS) * 2 ** retryCount;
              return new Promise((resolve) => setTimeout(resolve, delay));
            }
          }
        ]
      }
    });
    response
      .on("response", (response) => {
        // Check Content-Length header for file size validation
        const contentLength = response.headers["content-length"];
        if (contentLength) {
          const fileSize = parseInt(contentLength, 10);
          if (fileSize > maxFileSize) {
            writer.destroy();
            fs.unlink(filePath).catch(() => {
              // Ignore errors when cleaning up
            });
            throw new Error(
              `File size (${(fileSize / MB).toFixed(2)} MB) exceeds maximum allowed size (${(maxFileSize / MB).toFixed(2)} MB)`
            );
          }
        }

        // in verbose mode get content length to initialize progress bar
        if (this._options.verbose) {
          let totalLength = 0;
          if (contentLength) {
            totalLength = parseInt(contentLength, 10);
          }
          bar = multibar.create(totalLength, 0, {
            filename: filename
          });
        }
      })
      .on("downloadProgress", (progress) => {
        // Track bytes received for size validation
        totalBytesReceived = progress.transferred;

        // Check size during download (if Content-Length wasn't available)
        if (totalBytesReceived > maxFileSize) {
          writer.destroy();
          fs.unlink(filePath).catch(() => {
            // Ignore errors when cleaning up
          });
          throw new Error(
            `File size (${(totalBytesReceived / MB).toFixed(2)} MB) exceeds maximum allowed size (${(maxFileSize / MB).toFixed(2)} MB)`
          );
        }

        // in verbose mode update progress bar
        if (this._options.verbose && bar) {
          bar.update(progress.transferred);
        }
      });
    // pipe data stream to disk
    response.pipe(writer);
    return new Promise((resolve, reject) => {
      response.on("error", (err) => {
        writer.destroy();
        fs.unlink(filePath).catch(() => {});
        reject(err);
      });
      writer.on("finish", async () => {
        // Final size check
        if (totalBytesReceived > maxFileSize) {
          fs.unlink(filePath).catch(() => {
            // Ignore errors when cleaning up
          });
          reject(
            new Error(
              `File size (${(totalBytesReceived / MB).toFixed(2)} MB) exceeds maximum allowed size (${(maxFileSize / MB).toFixed(2)} MB)`
            )
          );
          return;
        }
        const hash = revisionHash(url);
        await this.set(hash, filePath, this._options.ttl);
        resolve();
      });
      writer.on("error", (err) => {
        fs.unlink(filePath).catch(() => {
          // Ignore errors when cleaning up
        });
        reject(err);
      });
    });
  }

  /**
   * Lookup cache entry by url
   * @param {*} url
   */
  get(url) {
    // return if cache is disabled
    if (!this._options.cacheEnabled) {
      return;
    }
    // lookup cache entry
    const data = this._cache.get(revisionHash(url));
    if (data) {
      // return if ttl expired
      if (data.ttl && data.ttl < Date.now()) {
        this.warn(`Cache hit expired for ${url}`);
        return;
      }
      // return value from disk
      return this.readFile(data.path);
    }
    // return finally
    return;
  }

  /**
   * Update cache file with new entry
   * @param {string} hash - Cache entry hash
   * @param {string} filePath - File path to cache
   * @param {number|undefined} ttl - Time to live in milliseconds (0 = infinite)
   * @returns {Promise<void>}
   */
  async set(hash, filePath, ttl) {
    // use 0 as undefined setting
    if (ttl === 0) {
      ttl = undefined;
    }
    // update cache
    this._cache.set(hash, {
      path: filePath,
      ttl: isNumber(ttl) ? Date.now() + ttl : undefined
    });
    // save cache to file with debouncing (prevents excessive disk writes)
    this._debouncedSaveCache();
  }

  /**
   * Applies rate limiting delay between requests
   * @private
   * @returns {Promise<void>}
   */
  async _applyRateLimit() {
    const rateLimitDelay = this._options.rateLimitDelay || DEFAULT_RATE_LIMIT_DELAY_MS;
    if (rateLimitDelay > 0) {
      const now = Date.now();
      const timeSinceLastRequest = now - this._lastRequestTime;
      if (timeSinceLastRequest < rateLimitDelay) {
        const delay = rateLimitDelay - timeSinceLastRequest;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      this._lastRequestTime = Date.now();
    }
  }

  /**
   * Debounced cache save to prevent excessive disk writes
   * @private
   */
  _debouncedSaveCache() {
    // Clear existing timer
    if (this._cacheSaveTimer) {
      clearTimeout(this._cacheSaveTimer);
    }
    // Set new timer
    this._cacheSaveTimer = setTimeout(async () => {
      try {
        await this.saveCacheFile();
      } catch (err) {
        this.warn("Failed to save cache file:", err.message);
      }
    }, CACHE_SAVE_DEBOUNCE_MS);
  }

  /**
   * Reads cache file from disk asynchronously
   * @private
   * @returns {Promise<void>}
   */
  async readCacheFile() {
    const file = this._options.workDir + this._options.cacheFilename;
    try {
      const json = await fs.readJson(file);
      // Validate cache file structure
      if (json && Array.isArray(json.cache)) {
        this._cache = new Map(json.cache);
        if (this._options.verbose) {
          this.info(`Cache file loaded: ${this._cache.size} entries`);
        }
      } else {
        // Invalid cache structure - always warn (not just in verbose mode)
        // as this indicates corrupted cache data
        console.warn(
          `gridsome-source-wikidata: Invalid cache file structure in ${file}. Cache will be initialized empty.`
        );
        this._cache = new Map();
      }
    } catch (err) {
      // Check if file exists to distinguish between "doesn't exist" vs "corrupted"
      const fileExists = await fs.pathExists(file);
      if (fileExists) {
        // File exists but is corrupted/invalid - always warn
        console.warn(
          `gridsome-source-wikidata: Cache file ${file} is corrupted or invalid (${err.message}). Cache will be initialized empty.`
        );
      }
      // File doesn't exist (normal on first run) - only log in verbose mode
      else if (this._options.verbose) {
        this.info("Cache file does not exist, starting with empty cache");
      }
      // Initialize empty cache
      this._cache = new Map();
    }
  }

  /**
   * Saves cache to disk
   * @private
   * @returns {Promise<void>}
   */
  async saveCacheFile() {
    const file = this._options.workDir + this._options.cacheFilename;
    // save cache to file
    // Note: Currently saves entire cache. Future optimization: implement incremental updates
    const json = { cache: [] };
    for (const [key, value] of this._cache) {
      json.cache.push([key, value]);
    }
    try {
      await fs.outputJson(file, json);
    } catch (err) {
      throw err;
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

export default HttpProxy;
