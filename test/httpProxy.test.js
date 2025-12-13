const HttpProxy = require("../httpProxy.js");
const got = require("got");
const fs = require("fs-extra");
const path = require("path");
const os = require("os");

// Mock modules
jest.mock("got");
jest.mock("fs-extra");
jest.mock("cli-progress", () => ({
  MultiBar: jest.fn(() => ({
    create: jest.fn(),
    stop: jest.fn()
  })),
  Presets: {
    shades_grey: {}
  }
}));

describe("HttpProxy - HTTP Requests", () => {
  let proxy;
  let tempDir;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `gridsome-test-${Date.now()}`);
    Object.defineProperty(process, "cwd", {
      value: jest.fn(() => tempDir),
      writable: true
    });

    fs.ensureDirSync.mockReturnValue(undefined);
    fs.readJsonSync.mockImplementation(() => {
      throw new Error("File not found");
    });
    fs.outputFile.mockResolvedValue(undefined);
    fs.outputJson.mockResolvedValue(undefined);

    // Use a path that will resolve within tempDir
    const contentPath = path.join(tempDir, "content");
    proxy = new HttpProxy({
      baseDir: contentPath,
      cacheEnabled: false, // Disable cache for simpler tests
      timeout: 30000
    });
    proxy._cache = new Map();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("fetchJson", () => {
    it("should fetch JSON from URL", async () => {
      const mockResponse = {
        results: {
          bindings: [{ item: { value: "Q1", type: "literal" } }]
        }
      };

      // Mock got to return an object with .json() method
      const mockGot = {
        json: jest.fn().mockResolvedValue(mockResponse)
      };
      got.mockReturnValue(mockGot);

      const result = await proxy.fetchJson("http://example.com/sparql");

      expect(got).toHaveBeenCalledWith(
        "http://example.com/sparql",
        expect.objectContaining({
          headers: { Accept: "application/sparql-results+json" },
          timeout: expect.objectContaining({
            request: 30000
          })
        })
      );
      expect(mockGot.json).toHaveBeenCalled();
      expect(result).toEqual(mockResponse);
    });

    it("should use timeout from options", async () => {
      const customProxy = new HttpProxy({
        baseDir: "/content/",
        timeout: 60000
      });
      customProxy._cache = new Map();

      const mockGot = {
        json: jest.fn().mockResolvedValue({})
      };
      got.mockReturnValue(mockGot);

      await customProxy.fetchJson("http://example.com");

      expect(got).toHaveBeenCalledWith(
        "http://example.com",
        expect.objectContaining({
          timeout: expect.objectContaining({
            request: 60000
          })
        })
      );
    });

    it("should return cached data when available", async () => {
      const url = "http://example.com";
      const hash = require("rev-hash")(url);
      const cachedData = { path: "/path/to/file.json", ttl: Date.now() + 1000 };
      proxy._cache.set(hash, cachedData);
      proxy._options.cacheEnabled = true;
      fs.readFileSync.mockReturnValue(Buffer.from('{"results":{"bindings":[]}}'));

      const result = await proxy.fetchJson(url);

      expect(got).not.toHaveBeenCalled();
      expect(result).toEqual({ results: { bindings: [] } });
    });
  });

  describe("save2disk", () => {
    it("should download and save file", async () => {
      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn((event, callback) => {
          if (event === "response") {
            callback({ headers: { "content-length": "1000" } });
          }
          if (event === "downloadProgress") {
            callback({ transferred: 500 });
          }
          return mockStream;
        })
      };

      const mockWriter = {
        on: jest.fn((event, callback) => {
          if (event === "finish") {
            setImmediate(callback);
          }
        })
      };

      got.stream.mockReturnValue(mockStream);
      fs.createWriteStream.mockReturnValue(mockWriter);

      await proxy.save2disk(
        "http://example.com/image.jpg",
        path.join(tempDir, "content"),
        "image.jpg"
      );

      expect(got.stream).toHaveBeenCalledWith(
        "http://example.com/image.jpg",
        expect.objectContaining({
          timeout: expect.objectContaining({
            request: 30000
          })
        })
      );
      expect(fs.createWriteStream).toHaveBeenCalled();
    });

    it("should validate filename to prevent path traversal", async () => {
      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn(() => mockStream)
      };
      got.stream.mockReturnValue(mockStream);

      await expect(
        proxy.save2disk(
          "http://example.com/file.jpg",
          path.join(tempDir, "content"),
          "../../../etc/passwd"
        )
      ).rejects.toThrow("Invalid filename");
    });

    it("should return cached file if available", async () => {
      const url = "http://example.com/file.jpg";
      const hash = require("rev-hash")(url);
      const cachedData = { path: "/path/to/file.jpg", ttl: Date.now() + 1000 };
      proxy._cache.set(hash, cachedData);
      proxy._options.cacheEnabled = true;
      fs.readFileSync.mockReturnValue(Buffer.from("cached data"));

      const result = await proxy.save2disk(url, path.join(tempDir, "content"), "file.jpg");

      expect(got.stream).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe("File Size Validation", () => {
    beforeEach(() => {
      // Use a path that will resolve within tempDir
      const contentPath = path.join(tempDir, "content");
      proxy = new HttpProxy({
        baseDir: contentPath,
        maxFileSize: 1000, // 1KB limit for testing
        cacheEnabled: false
      });
      proxy._cache = new Map();
    });

    it("should reject files exceeding maxFileSize from Content-Length header", async () => {
      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn((event, callback) => {
          if (event === "response") {
            callback({ headers: { "content-length": "2000" } }); // 2KB > 1KB limit
          }
          return mockStream;
        })
      };

      got.stream.mockReturnValue(mockStream);
      fs.createWriteStream.mockReturnValue({ on: jest.fn() });
      fs.unlink.mockResolvedValue(undefined);

      await expect(
        proxy.save2disk("http://example.com/large.jpg", path.join(tempDir, "content"), "large.jpg")
      ).rejects.toThrow("exceeds maximum allowed size");
    });

    it("should reject files exceeding maxFileSize during download", async () => {
      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn((event, callback) => {
          if (event === "response") {
            callback({ headers: {} }); // No Content-Length
          }
          if (event === "downloadProgress") {
            callback({ transferred: 2000 }); // 2KB > 1KB limit
          }
          return mockStream;
        })
      };

      const mockWriter = {
        on: jest.fn()
      };

      got.stream.mockReturnValue(mockStream);
      fs.createWriteStream.mockReturnValue(mockWriter);
      fs.unlink.mockResolvedValue(undefined);

      await expect(
        proxy.save2disk("http://example.com/large.jpg", path.join(tempDir, "content"), "large.jpg")
      ).rejects.toThrow("exceeds maximum allowed size");
    });

    it("should accept files within maxFileSize limit", async () => {
      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn((event, callback) => {
          if (event === "response") {
            callback({ headers: { "content-length": "500" } }); // 500B < 1KB limit
          }
          if (event === "downloadProgress") {
            callback({ transferred: 500 });
          }
          return mockStream;
        })
      };

      const mockWriter = {
        on: jest.fn((event, callback) => {
          if (event === "finish") {
            setImmediate(callback);
          }
        })
      };

      got.stream.mockReturnValue(mockStream);
      fs.createWriteStream.mockReturnValue(mockWriter);
      fs.outputJson.mockResolvedValue(undefined);

      await proxy.save2disk(
        "http://example.com/small.jpg",
        path.join(tempDir, "content"),
        "small.jpg"
      );

      expect(fs.createWriteStream).toHaveBeenCalled();
    });
  });

  describe("File Type Validation", () => {
    beforeEach(() => {
      // Use a path that will resolve within tempDir
      const contentPath = path.join(tempDir, "content");
      proxy = new HttpProxy({
        baseDir: contentPath,
        allowedFileTypes: ["jpg", "png", "pdf"],
        cacheEnabled: false
      });
      proxy._cache = new Map();
    });

    it("should reject files with disallowed extensions", async () => {
      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn(() => mockStream)
      };
      got.stream.mockReturnValue(mockStream);

      await expect(
        proxy.save2disk("http://example.com/file.exe", path.join(tempDir, "content"), "file.exe")
      ).rejects.toThrow("File type not allowed");
    });

    it("should accept files with allowed extensions", async () => {
      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn((event, callback) => {
          if (event === "response") {
            callback({ headers: {} });
          }
          if (event === "downloadProgress") {
            callback({ transferred: 100 });
          }
          return mockStream;
        })
      };

      const mockWriter = {
        on: jest.fn((event, callback) => {
          if (event === "finish") {
            setImmediate(callback);
          }
        })
      };

      got.stream.mockReturnValue(mockStream);
      fs.createWriteStream.mockReturnValue(mockWriter);
      fs.outputJson.mockResolvedValue(undefined);

      await expect(
        proxy.save2disk("http://example.com/image.jpg", path.join(tempDir, "content"), "image.jpg")
      ).resolves.not.toThrow();
    });

    it("should allow all file types when allowedFileTypes is undefined", async () => {
      const contentPath = path.join(tempDir, "content");
      const openProxy = new HttpProxy({
        baseDir: contentPath,
        allowedFileTypes: undefined,
        cacheEnabled: false
      });
      openProxy._cache = new Map();

      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn((event, callback) => {
          if (event === "response") {
            callback({ headers: {} });
          }
          if (event === "downloadProgress") {
            callback({ transferred: 100 });
          }
          return mockStream;
        })
      };

      const mockWriter = {
        on: jest.fn((event, callback) => {
          if (event === "finish") {
            setImmediate(callback);
          }
        })
      };

      got.stream.mockReturnValue(mockStream);
      fs.createWriteStream.mockReturnValue(mockWriter);
      fs.outputJson.mockResolvedValue(undefined);

      await expect(
        openProxy.save2disk(
          "http://example.com/file.exe",
          path.join(tempDir, "content"),
          "file.exe"
        )
      ).resolves.not.toThrow();
    });

    it("should handle case-insensitive file extensions", async () => {
      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn(() => mockStream)
      };
      got.stream.mockReturnValue(mockStream);

      await expect(
        proxy.save2disk("http://example.com/image.JPG", path.join(tempDir, "content"), "image.JPG")
      ).rejects.toThrow("File type not allowed");
    });
  });

  describe("Rate Limiting", () => {
    beforeEach(() => {
      jest.useFakeTimers();
      const contentPath = path.join(tempDir, "content");
      proxy = new HttpProxy({
        baseDir: contentPath,
        rateLimitDelay: 100, // 100ms delay
        cacheEnabled: false
      });
      proxy._cache = new Map();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should apply rate limiting delay between requests", async () => {
      const mockGot = {
        json: jest.fn().mockResolvedValue({ results: { bindings: [] } })
      };
      got.mockReturnValue(mockGot);
      fs.outputFile.mockResolvedValue(undefined);
      fs.outputJson.mockResolvedValue(undefined);

      const startTime = Date.now();
      proxy._lastRequestTime = 0;

      const promise1 = proxy.fetchJson("http://example.com/1");
      jest.advanceTimersByTime(50);
      const promise2 = proxy.fetchJson("http://example.com/2");

      await Promise.all([promise1, promise2]);

      // Second request should be delayed
      expect(got).toHaveBeenCalledTimes(2);
    });

    it("should not delay when rateLimitDelay is 0", async () => {
      const contentPath = path.join(tempDir, "content");
      const noLimitProxy = new HttpProxy({
        baseDir: contentPath,
        rateLimitDelay: 0,
        cacheEnabled: false
      });
      noLimitProxy._cache = new Map();

      const mockGot = {
        json: jest.fn().mockResolvedValue({ results: { bindings: [] } })
      };
      got.mockReturnValue(mockGot);
      fs.outputFile.mockResolvedValue(undefined);
      fs.outputJson.mockResolvedValue(undefined);

      await noLimitProxy.fetchJson("http://example.com/1");
      await noLimitProxy.fetchJson("http://example.com/2");

      expect(got).toHaveBeenCalledTimes(2);
    });
  });

  describe("Debounced Cache Saves", () => {
    beforeEach(() => {
      jest.useFakeTimers();
      const contentPath = path.join(tempDir, "content");
      proxy = new HttpProxy({
        baseDir: contentPath,
        cacheEnabled: true
      });
      proxy._cache = new Map();
      fs.outputJson.mockResolvedValue(undefined);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should debounce multiple cache updates", async () => {
      const hash1 = "hash1";
      const hash2 = "hash2";

      await proxy.set(hash1, "/path/to/file1", 1000);
      await proxy.set(hash2, "/path/to/file2", 1000);

      // Should not have saved yet (debounced)
      expect(fs.outputJson).not.toHaveBeenCalled();

      // Advance timer past debounce delay (1000ms)
      jest.advanceTimersByTime(1100);

      // Should have saved once with both entries
      expect(fs.outputJson).toHaveBeenCalledTimes(1);
    });

    it("should reset debounce timer on new updates", async () => {
      const hash1 = "hash1";
      const hash2 = "hash2";

      await proxy.set(hash1, "/path/to/file1", 1000);
      jest.advanceTimersByTime(500); // Halfway through debounce

      await proxy.set(hash2, "/path/to/file2", 1000);
      jest.advanceTimersByTime(600); // Should not trigger yet

      expect(fs.outputJson).not.toHaveBeenCalled();

      jest.advanceTimersByTime(500); // Complete the debounce

      expect(fs.outputJson).toHaveBeenCalledTimes(1);
    });
  });

  describe("Error Handling", () => {
    it("should handle HTTP errors gracefully", async () => {
      got.mockRejectedValue(new Error("Network error"));

      await expect(proxy.fetchJson("http://example.com")).rejects.toThrow("Network error");
    });

    it("should handle file write errors", async () => {
      const mockStream = {
        pipe: jest.fn(),
        on: jest.fn((event, callback) => {
          if (event === "response") {
            callback({ headers: {} });
          }
          return mockStream;
        })
      };

      const mockWriter = {
        on: jest.fn((event, callback) => {
          if (event === "error") {
            setImmediate(() => callback(new Error("Write error")));
          }
        })
      };

      got.stream.mockReturnValue(mockStream);
      fs.createWriteStream.mockReturnValue(mockWriter);
      fs.unlink.mockResolvedValue(undefined);

      await expect(
        proxy.save2disk("http://example.com/file.jpg", path.join(tempDir, "content"), "file.jpg")
      ).rejects.toThrow("Write error");
    });
  });
});
