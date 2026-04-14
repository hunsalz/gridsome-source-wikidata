[![npm](https://img.shields.io/npm/v/gridsome-source-wikidata.svg)](https://www.npmjs.com/package/gridsome-source-wikidata)
[![npm](https://img.shields.io/npm/dt/gridsome-source-wikidata.svg)](https://www.npmjs.com/package/gridsome-source-wikidata)
[![License](https://img.shields.io/badge/license-MIT%20License-blue.svg)](http://doge.mit-license.org)

# gridsome-source-wikidata

## Install

```bash
npm install gridsome-source-wikidata
```

## Quick Start

Add the plugin to your `gridsome.config.js`:

```javascript
module.exports = {
  plugins: [
    {
      use: "gridsome-source-wikidata",
      options: {
        url: "https://query.wikidata.org/sparql",
        sparql: `SELECT ?item ?label ?image WHERE {
          ?item wdt:P31 wd:Q5;
            rdfs:label ?label;
            wdt:P18 ?image.
          BIND(REPLACE(STR(?item), "^.*/", "") AS ?item)
          FILTER(LANG(?label) = "en")
        } LIMIT 50`,
        typeName: "Person"
      }
    }
  ],
  templates: {
    Person: "/:item"
  }
};
```

**Key options:**

- `url` — SPARQL endpoint (required)
- `sparql` — SPARQL SELECT query (required)
- `typeName` — GraphQL collection name, must start with uppercase (required)
- `baseDir` — Where to download media files (default: `/content/`)
- `verbose` — Enable progress logging (default: false)

See the [Options](#options) section below for all available settings.

## Example Queries

### People (Scientists, Artists, etc.)

```sparql
SELECT ?item ?personLabel ?birthDate ?image WHERE {
  ?person wdt:P31 wd:Q5;        # Instance of human
    wdt:P106 wd:Q901;            # Occupation: scientist
    wdt:P569 ?birthDate;         # Date of birth
    wdt:P18 ?image.              # Image
  BIND(REPLACE(STR(?person), "^.*/", "") AS ?item)
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en".
    ?person rdfs:label ?personLabel.
  }
}
LIMIT 50
```

### Places with Coordinates

```sparql
SELECT ?item ?cityLabel ?countryLabel ?latitude ?longitude WHERE {
  ?city wdt:P31 wd:Q515;             # Instance of city
    wdt:P17 ?country;                # Country
    wdt:P625 ?coordinates.           # Coordinates
  BIND(REPLACE(STR(?city), "^.*/", "") AS ?item)
  BIND(xsd:decimal(SUBSTR(STR(?coordinates), 1, 20)) AS ?latitude)
  BIND(xsd:decimal(SUBSTR(STR(?coordinates), 22, 20)) AS ?longitude)
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en".
    ?city rdfs:label ?cityLabel.
    ?country rdfs:label ?countryLabel.
  }
}
LIMIT 50
```

### Books with Authors

```sparql
SELECT ?item ?bookLabel ?authorLabel ?publicationDate WHERE {
  ?book wdt:P31 wd:Q571;          # Instance of book
    wdt:P50 ?author;              # Author
    wdt:P577 ?publicationDate;    # Publication date
    wdt:P18 ?image.               # Cover image
  BIND(REPLACE(STR(?book), "^.*/", "") AS ?item)
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en".
    ?book rdfs:label ?bookLabel.
    ?author rdfs:label ?authorLabel.
  }
}
LIMIT 100
```

For more query examples, visit the [Wikidata SPARQL query service](https://query.wikidata.org/) and test queries directly there.

### SPARQL Tips

- **Always include `?item`**: Use `BIND(REPLACE(STR(?entity), "^.*/", "") AS ?item)` to create stable node IDs
- **Use labels**: Include `SERVICE wikibase:label` to fetch human-readable labels
- **Filter efficiently**: Use `FILTER`, `LIMIT`, and `ORDER BY` to control results
- **Download images**: Use `wdt:P18` for media URIs that this plugin will automatically download

## Options

| **Property**       | **Type**   | **Description**                                                                       | **Required** | **Default**           |
| ------------------ | ---------- | ------------------------------------------------------------------------------------- | ------------ | --------------------- |
| `url`              | `string`   | SPARQL endpoint URL                                                                   | ✅ Yes       | -                     |
| `sparql`           | `string`   | SPARQL SELECT query                                                                   | ✅ Yes       | -                     |
| `typeName`         | `string`   | GraphQL collection name (uppercase, alphanumeric only)                                | ✅ Yes       | -                     |
| `baseDir`          | `string`   | Directory for downloaded files                                                        | ❌ No        | `"/content/"`         |
| `cacheEnabled`     | `boolean`  | Enable/disable caching                                                                | ❌ No        | `true`                |
| `ttl`              | `number`   | Cache TTL in milliseconds                                                             | ❌ No        | `86400000` (24 hours) |
| `timeout`          | `number`   | HTTP request timeout in milliseconds                                                  | ❌ No        | `30000`               |
| `maxFileSize`      | `number`   | Max file size in bytes                                                                | ❌ No        | `104857600` (100 MB)  |
| `allowedFileTypes` | `string[]` | Allowed file extensions (e.g., `['jpg', 'png']`). Undefined = all allowed.            | ❌ No        | `undefined`           |
| `rateLimitDelay`   | `number`   | Delay between requests in milliseconds (prevents rate limiting). Set to 0 to disable. | ❌ No        | `100`                 |
| `maxRetries`       | `number`   | Retry attempts for transient errors                                                   | ❌ No        | `2`                   |
| `retryDelay`       | `number`   | Initial retry delay in milliseconds (exponential backoff applied)                     | ❌ No        | `1000`                |
| `verbose`          | `boolean`  | Enable verbose logging                                                                | ❌ No        | `false`               |
| `cacheFilename`    | `string`   | Cache file name                                                                       | ❌ No        | `".cache.json"`       |

## Gridsome Compatibility

This plugin is compatible with:

- Gridsome `^0.7.0` or `^1.0.0`
- Node.js `>=22.0.0`

## Using Data in Templates

SPARQL query variables map directly to GraphQL fields. For a query with `SELECT ?item ?label ?image`, the fields become `item`, `label`, and `image`.

**Node IDs**: Include `?item` in your query and extract the Wikidata ID using:

```sparql
BIND(REPLACE(STR(?item), "^.*/", "") AS ?item)
```

**In gridsome.config.js**:

```javascript
templates: {
  Person: "/people/:item"; // Uses the item field from your query
}
```

**In your Vue template** (`src/templates/Person.vue`):

```vue
<template>
  <div>
    <h1>{{ $page.person.label }}</h1>
    <img :src="$page.person.image" :alt="$page.person.label" />
  </div>
</template>

<page-query>
query Person ($id: ID!) {
  person(id: $id) {
    item
    label
    image
  }
}
</page-query>
```

## Troubleshooting

### Common Errors

#### "Missing 'url' endpoint"

- **Cause**: The `url` option is missing or empty
- **Fix**: Provide a valid SPARQL endpoint URL

#### "Invalid 'url' format"

- **Cause**: The URL is malformed
- **Fix**: Ensure the URL is a valid HTTP/HTTPS URL (e.g., `https://query.wikidata.org/sparql`)

#### "Invalid 'sparql' query"

- **Cause**: SPARQL query is empty or doesn't contain valid SPARQL keywords
- **Fix**: Ensure your query contains `SELECT`, `ASK`, `CONSTRUCT`, or `DESCRIBE`

#### "Invalid 'typeName' format"

- **Cause**: Type name doesn't follow GraphQL naming conventions
- **Fix**: Type name must start with an uppercase letter and contain only alphanumeric characters (e.g., `Painting`, `Artwork`, `Item123`)

#### "Invalid baseDir: path must be within project directory"

- **Cause**: Attempted path traversal detected
- **Fix**: Use a relative path within your project (e.g., `/content/` or `/data/images/`)

#### "Failed to fetch Wikidata"

- **Cause**: Network error, timeout, or invalid SPARQL query
- **Fix**:
  - Check your internet connection
  - Verify the SPARQL query syntax
  - Increase `timeout` option if requests are slow
  - Enable `verbose: true` for detailed error messages

#### Downloads failing

- **Cause**: Network issues, invalid URIs, file system permissions, file size limits, or file type restrictions
- **Fix**:
  - Check file system permissions for `baseDir`
  - Verify URIs in SPARQL results are accessible
  - Check if file size exceeds `maxFileSize` limit (default: 100MB)
  - Verify file extension is in `allowedFileTypes` array (if specified)
  - Enable `verbose: true` to see download progress

#### "File size exceeds maximum allowed size"

- **Cause**: Downloaded file is larger than `maxFileSize` option
- **Fix**: Increase `maxFileSize` option (in bytes) or download smaller files

#### "File type not allowed"

- **Cause**: File extension is not in `allowedFileTypes` array
- **Fix**: Add the file extension to `allowedFileTypes` array or remove the restriction

### Error Handling Example

```javascript
module.exports = {
  plugins: [
    {
      use: "gridsome-source-wikidata",
      options: {
        url: "https://query.wikidata.org/sparql",
        sparql: `SELECT ?item WHERE { ... }`,
        typeName: "Item",
        verbose: true, // Enable for debugging
        timeout: 60000, // Increase timeout for slow queries
        maxFileSize: 50 * 1024 * 1024, // 50 MB limit
        allowedFileTypes: ["jpg", "png", "gif", "pdf"] // Only allow these file types
      }
    }
  ]
};
```

If errors occur during build, they will be logged to the console. Check the error message for specific guidance.

## Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Make your changes** following the existing code style
4. **Test your changes** (if tests are added)
5. **Commit your changes** (`git commit -m 'Add some amazing feature'`)
6. **Push to the branch** (`git push origin feature/amazing-feature`)
7. **Open a Pull Request**

### Code Style

- Follow the existing code style (2-space indentation)
- Add JSDoc comments for new functions
- Keep functions focused and small
- Maintain Gridsome compatibility

### Reporting Issues

When reporting issues, please include:

- Gridsome version
- Node.js version
- Plugin version
- Error messages (with `verbose: true` enabled)
- SPARQL query (if applicable)
- Steps to reproduce

## Open Issues

- Add selective URI downloads with appropriate filter options
