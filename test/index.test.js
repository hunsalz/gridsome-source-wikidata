import { jest } from "@jest/globals";
import path from "path";
import os from "os";

// Mocks must be registered before importing the modules under test
jest.unstable_mockModule("fs-extra", () => ({
  default: {
    ensureDirSync: jest.fn(),
    readJson: jest.fn(),
    pathExists: jest.fn(),
    outputFile: jest.fn(),
    outputJson: jest.fn(),
    readFileSync: jest.fn()
  }
}));

jest.unstable_mockModule("got", () => ({
  default: Object.assign(jest.fn(), { stream: jest.fn() })
}));

const { default: SourcePlugin } = await import("../index.js");
const { default: HttpProxy } = await import("../httpProxy.js");
const { default: got } = await import("got");
const { default: fs } = await import("fs-extra");

describe("SourcePlugin", () => {
  let mockApi;
  let tempDir;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `gridsome-test-${Date.now()}`);
    process.chdir = jest.fn();
    Object.defineProperty(process, "cwd", {
      value: jest.fn(() => tempDir),
      writable: true
    });

    mockApi = {
      loadSource: jest.fn((callback) => {
        setImmediate(() => {
          const mockActions = {
            addCollection: jest.fn(() => ({
              addNode: jest.fn()
            }))
          };
          callback(mockActions);
        });
      }),
      onCreateNode: jest.fn()
    };

    fs.ensureDirSync.mockReturnValue(undefined);
    fs.readJson.mockImplementation(() => {
      return Promise.reject(new Error("File not found"));
    });

    const mockGot = {
      json: jest.fn().mockResolvedValue({ results: { bindings: [] } })
    };
    got.mockReturnValue(mockGot);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Option Validation", () => {
    it("should throw error if url is missing", () => {
      expect(() => {
        new SourcePlugin(mockApi, {
          sparql: "SELECT ?item WHERE { ?item wdt:P31 wd:Q5 }",
          typeName: "Person"
        });
      }).toThrow("Missing 'url' endpoint");
    });

    it("should throw error if sparql is missing", () => {
      expect(() => {
        new SourcePlugin(mockApi, {
          url: "https://query.wikidata.org/sparql",
          typeName: "Person"
        });
      }).toThrow("Missing 'sparql' query");
    });

    it("should throw error if typeName is missing", () => {
      expect(() => {
        new SourcePlugin(mockApi, {
          url: "https://query.wikidata.org/sparql",
          sparql: "SELECT ?item WHERE { ?item wdt:P31 wd:Q5 }"
        });
      }).toThrow("Missing 'typeName' label");
    });

    it("should throw error if url is invalid", () => {
      expect(() => {
        new SourcePlugin(mockApi, {
          url: "not-a-valid-url",
          sparql: "SELECT ?item WHERE { ?item wdt:P31 wd:Q5 }",
          typeName: "Person"
        });
      }).toThrow("Invalid 'url' format");
    });

    it("should throw error if sparql is empty", () => {
      expect(() => {
        new SourcePlugin(mockApi, {
          url: "https://query.wikidata.org/sparql",
          sparql: "",
          typeName: "Person"
        });
      }).toThrow("Missing 'sparql' query");
    });

    it("should throw error if sparql is not a valid SPARQL query", () => {
      expect(() => {
        new SourcePlugin(mockApi, {
          url: "https://query.wikidata.org/sparql",
          sparql: "not a sparql query",
          typeName: "Person"
        });
      }).toThrow("Invalid 'sparql' query");
    });

    it("should throw error if typeName doesn't start with uppercase", () => {
      expect(() => {
        new SourcePlugin(mockApi, {
          url: "https://query.wikidata.org/sparql",
          sparql: "SELECT ?item WHERE { ?item wdt:P31 wd:Q5 }",
          typeName: "person"
        });
      }).toThrow("Invalid 'typeName' format");
    });

    it("should throw error if typeName contains invalid characters", () => {
      expect(() => {
        new SourcePlugin(mockApi, {
          url: "https://query.wikidata.org/sparql",
          sparql: "SELECT ?item WHERE { ?item wdt:P31 wd:Q5 }",
          typeName: "Person-Name"
        });
      }).toThrow("Invalid 'typeName' format");
    });

    it("should accept valid options", () => {
      expect(() => {
        new SourcePlugin(mockApi, {
          url: "https://query.wikidata.org/sparql",
          sparql: "SELECT ?item WHERE { ?item wdt:P31 wd:Q5 }",
          typeName: "Person",
          baseDir: "content"
        });
      }).not.toThrow();
    });

    it("should accept valid SPARQL queries (SELECT, ASK, CONSTRUCT, DESCRIBE)", () => {
      const queries = [
        "SELECT ?item WHERE { ?item wdt:P31 wd:Q5 }",
        "ASK { ?item wdt:P31 wd:Q5 }",
        "CONSTRUCT { ?item ?p ?o } WHERE { ?item ?p ?o }",
        "DESCRIBE ?item WHERE { ?item wdt:P31 wd:Q5 }"
      ];

      queries.forEach((query) => {
        expect(() => {
          new SourcePlugin(mockApi, {
            url: "https://query.wikidata.org/sparql",
            sparql: query,
            typeName: "Item",
            baseDir: "content"
          });
        }).not.toThrow();
      });
    });
  });

  describe("Default Options", () => {
    it("should use default values when options are not provided", () => {
      const plugin = new SourcePlugin(mockApi, {
        url: "https://query.wikidata.org/sparql",
        sparql: "SELECT ?item WHERE { ?item wdt:P31 wd:Q5 }",
        typeName: "Person"
      });

      expect(plugin._options.baseDir).toBe("/content/");
      expect(plugin._options.cacheFilename).toBe(".cache.json");
      expect(plugin._options.cacheEnabled).toBe(true);
      expect(plugin._options.verbose).toBe(false);
    });

    it("should override defaults with provided options", () => {
      const plugin = new SourcePlugin(mockApi, {
        url: "https://query.wikidata.org/sparql",
        sparql: "SELECT ?item WHERE { ?item wdt:P31 wd:Q5 }",
        typeName: "Person",
        baseDir: "custom",
        cacheEnabled: false,
        verbose: true
      });

      expect(plugin._options.baseDir).toBe("custom");
      expect(plugin._options.cacheEnabled).toBe(false);
      expect(plugin._options.verbose).toBe(true);
    });
  });

  describe("API Integration", () => {
    it("should register loadSource hook", () => {
      new SourcePlugin(mockApi, {
        url: "https://query.wikidata.org/sparql",
        sparql: "SELECT ?item WHERE { ?item wdt:P31 wd:Q5 }",
        typeName: "Person",
        baseDir: "content"
      });

      expect(mockApi.loadSource).toHaveBeenCalled();
      expect(typeof mockApi.loadSource.mock.calls[0][0]).toBe("function");
    });
  });
});

describe("HttpProxy", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `gridsome-test-${Date.now()}`);
    Object.defineProperty(process, "cwd", {
      value: jest.fn(() => tempDir),
      writable: true
    });

    fs.ensureDirSync.mockReturnValue(undefined);
    fs.readJson.mockImplementation(() => {
      return Promise.reject(new Error("File not found"));
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Initialization", () => {
    it("should create work directory", () => {
      const contentPath = path.join(tempDir, "content");
      new HttpProxy({
        baseDir: contentPath
      });

      expect(fs.ensureDirSync).toHaveBeenCalled();
    });

    it("should read cache file if it exists", async () => {
      const contentPath = path.join(tempDir, "content");
      fs.readJson.mockResolvedValue({
        cache: [["hash1", { path: "/path/to/file", ttl: Date.now() + 1000 }]]
      });

      const proxy = new HttpProxy({
        baseDir: contentPath
      });

      await new Promise((resolve) => setImmediate(resolve));

      expect(fs.readJson).toHaveBeenCalled();
      expect(proxy._cache).toBeDefined();
    });

    it("should initialize empty cache if file doesn't exist", () => {
      fs.readFileSync = jest.fn(() => {
        throw new Error("File not found");
      });

      const contentPath = path.join(tempDir, "content");
      const proxy = new HttpProxy({
        baseDir: contentPath
      });

      expect(proxy._cache).toBeDefined();
      expect(proxy._cache.size).toBe(0);
    });
  });

  describe("Path Validation", () => {
    it("should throw error for path traversal in baseDir", () => {
      expect(() => {
        new HttpProxy({
          baseDir: "../../../etc"
        });
      }).toThrow("Invalid baseDir");
    });

    it("should accept valid baseDir", () => {
      expect(() => {
        const contentPath = path.join(tempDir, "content");
        new HttpProxy({
          baseDir: contentPath
        });
      }).not.toThrow();
    });
  });

  describe("Cache Operations", () => {
    let proxy;

    beforeEach(async () => {
      const contentPath = path.join(tempDir, "content");
      proxy = new HttpProxy({
        baseDir: contentPath,
        cacheEnabled: true
      });
      proxy._cache = new Map();
      fs.outputJson.mockResolvedValue(undefined);
    });

    it("should return undefined when cache is disabled", () => {
      proxy._options.cacheEnabled = false;
      const result = proxy.get("http://example.com");
      expect(result).toBeUndefined();
    });

    it("should return undefined for non-cached URL", () => {
      const result = proxy.get("http://example.com");
      expect(result).toBeUndefined();
    });

    it("should return cached data when available", async () => {
      const { default: revisionHash } = await import("rev-hash");
      const url = "http://example.com";
      const hash = revisionHash(url);
      const cachedData = { path: "/path/to/file", ttl: Date.now() + 1000 };
      proxy._cache.set(hash, cachedData);
      fs.readFileSync.mockReturnValue(Buffer.from('{"test": "data"}'));

      const result = proxy.get(url);
      expect(result).toBeDefined();
    });

    it("should return undefined for expired cache", async () => {
      const { default: revisionHash } = await import("rev-hash");
      const url = "http://example.com";
      const hash = revisionHash(url);
      const cachedData = { path: "/path/to/file", ttl: Date.now() - 1000 };
      proxy._cache.set(hash, cachedData);

      const result = proxy.get(url);
      expect(result).toBeUndefined();
    });
  });
});
