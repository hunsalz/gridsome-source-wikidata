[![npm](https://img.shields.io/npm/v/gridsome-source-wikidata.svg)](https://www.npmjs.com/package/gridsome-source-wikidata)
[![npm](https://img.shields.io/npm/dt/gridsome-source-wikidata.svg)](https://www.npmjs.com/package/gridsome-source-wikidata)
[![License](https://img.shields.io/badge/license-MIT%20License-blue.svg)](http://doge.mit-license.org)

# gridsome-source-wikidata

## Install

- yarn add gridsome-source-wikidata
- npm install gridsome-source-wikidata

## Usage

```
module.exports = {
  plugins: [
    {
      use: "gridsome-source-wikidata",
      options: {
        url: "https://query.wikidata.org/sparql",
        sparql: `SELECT DISTINCT ?item ?paintingLabel (MIN(?images) AS ?image) WHERE {
          ?painting (wdt:P31/(wdt:P279*)) wd:Q3305213;
            wdt:P170 wd:Q762;
            wdt:P18 ?images;
          BIND(REPLACE(STR(?painting), "^.*/", "") AS ?item)
          SERVICE wikibase:label {
            bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en".
            ?painting rdfs:label ?paintingLabel.
          }
        }
        GROUP BY ?item ?painting ?paintingLabel ?image
        LIMIT 10`,
        typeName: "Painting",
        baseDir: "/content/images/",
        verbose: true
      }
    },
  templates: {
    Painting: "/:item"
  }
}
```

Query SPARQL in [Wikidata Query Service](https://query.wikidata.org/#SELECT%20DISTINCT%20%3Fitem%20%3FpaintingLabel%20%28MIN%28%3Fimages%29%20AS%20%3Fimage%29%20WHERE%20%7B%0A%20%20%3Fpainting%20%28wdt%3AP31%2F%28wdt%3AP279%2a%29%29%20wd%3AQ3305213%3B%0A%20%20%20%20wdt%3AP170%20wd%3AQ762%3B%0A%20%20%20%20wdt%3AP18%20%3Fimages%3B%0A%20%20BIND%28REPLACE%28STR%28%3Fpainting%29%2C%20%22%5E.%2a%2F%22%2C%20%22%22%29%20AS%20%3Fitem%29%0A%20%20SERVICE%20wikibase%3Alabel%20%7B%0A%20%20%20%20bd%3AserviceParam%20wikibase%3Alanguage%20%22%5BAUTO_LANGUAGE%5D%2Cen%22.%0A%20%20%20%20%3Fpainting%20rdfs%3Alabel%20%3FpaintingLabel.%0A%20%20%7D%0A%7D%0AGROUP%20BY%20%3Fitem%20%3Fpainting%20%3FpaintingLabel%20%3Fimage%0ALIMIT%2010)

## Example Queries

Here are common SPARQL query examples for different use cases:

### People / Biographies

Query for notable people (e.g., scientists, artists, politicians):

```javascript
{
  use: "gridsome-source-wikidata",
  options: {
    url: "https://query.wikidata.org/sparql",
    sparql: `SELECT ?item ?personLabel ?birthDate ?image WHERE {
      ?person wdt:P31 wd:Q5;  # Instance of human
        wdt:P106 wd:Q901;      # Occupation: scientist
        wdt:P569 ?birthDate;   # Date of birth
        wdt:P18 ?image;        # Image
      BIND(REPLACE(STR(?person), "^.*/", "") AS ?item)
      SERVICE wikibase:label {
        bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en".
        ?person rdfs:label ?personLabel.
      }
    }
    LIMIT 50`,
    typeName: "Person"
  }
}
```

### Books / Publications

Query for books with authors and cover images:

```javascript
{
  use: "gridsome-source-wikidata",
  options: {
    url: "https://query.wikidata.org/sparql",
    sparql: `SELECT ?item ?bookLabel ?authorLabel ?publicationDate ?coverImage WHERE {
      ?book wdt:P31 wd:Q571;        # Instance of book
        wdt:P50 ?author;            # Author
        wdt:P577 ?publicationDate;  # Publication date
        wdt:P18 ?coverImage;        # Cover image
      BIND(REPLACE(STR(?book), "^.*/", "") AS ?item)
      SERVICE wikibase:label {
        bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en".
        ?book rdfs:label ?bookLabel.
        ?author rdfs:label ?authorLabel.
      }
    }
    LIMIT 100`,
    typeName: "Book"
  }
}
```

### Places / Locations

Query for cities with coordinates and images:

```javascript
{
  use: "gridsome-source-wikidata",
  options: {
    url: "https://query.wikidata.org/sparql",
    sparql: `SELECT ?item ?cityLabel ?countryLabel ?latitude ?longitude ?image WHERE {
      ?city wdt:P31 wd:Q515;        # Instance of city
        wdt:P17 ?country;           # Country
        wdt:P625 ?coordinates;      # Coordinates
        wdt:P18 ?image;             # Image
      BIND(REPLACE(STR(?city), "^.*/", "") AS ?item)
      BIND(xsd:decimal(SUBSTR(STR(?coordinates), 1, 20)) AS ?latitude)
      BIND(xsd:decimal(SUBSTR(STR(?coordinates), 22, 20)) AS ?longitude)
      SERVICE wikibase:label {
        bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en".
        ?city rdfs:label ?cityLabel.
        ?country rdfs:label ?countryLabel.
      }
    }
    LIMIT 50`,
    typeName: "City"
  }
}
```

### Organizations / Companies

Query for organizations with logos:

```javascript
{
  use: "gridsome-source-wikidata",
  options: {
    url: "https://query.wikidata.org/sparql",
    sparql: `SELECT ?item ?orgLabel ?foundedDate ?logo WHERE {
      ?org wdt:P31/wdt:P279* wd:Q4830453;  # Instance of business
        wdt:P571 ?foundedDate;               # Inception date
        wdt:P154 ?logo;                      # Logo image
      BIND(REPLACE(STR(?org), "^.*/", "") AS ?item)
      SERVICE wikibase:label {
        bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en".
        ?org rdfs:label ?orgLabel.
      }
    }
    LIMIT 50`,
    typeName: "Organization"
  }
}
```

### Events / Historical Events

Query for historical events with dates and descriptions:

```javascript
{
  use: "gridsome-source-wikidata",
  options: {
    url: "https://query.wikidata.org/sparql",
    sparql: `SELECT ?item ?eventLabel ?date ?description WHERE {
      ?event wdt:P31 wd:Q1190554;   # Instance of occurrence
        wdt:P585 ?date;              # Point in time
        wdt:P1705 ?description;      # Native label
      BIND(REPLACE(STR(?event), "^.*/", "") AS ?item)
      SERVICE wikibase:label {
        bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en".
        ?event rdfs:label ?eventLabel.
      }
    }
    ORDER BY DESC(?date)
    LIMIT 100`,
    typeName: "Event"
  }
}
```

### Simple Item Lookup

Query for items by specific property (e.g., all items with a specific tag):

```javascript
{
  use: "gridsome-source-wikidata",
  options: {
    url: "https://query.wikidata.org/sparql",
    sparql: `SELECT ?item ?itemLabel ?description WHERE {
      ?item wdt:P31 wd:Q5;           # Instance of human
        wdt:P569 ?birthDate;         # Date of birth
        schema:description ?description.
      FILTER(YEAR(?birthDate) > 1900)
      SERVICE wikibase:label {
        bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en".
        ?item rdfs:label ?itemLabel.
      }
    }
    LIMIT 50`,
    typeName: "Item"
  }
}
```

### Tips for Writing SPARQL Queries

1. **Always include `?item`**: Use `BIND(REPLACE(STR(?entity), "^.*/", "") AS ?item)` to extract the Wikidata ID
2. **Use labels**: Include `SERVICE wikibase:label` to get human-readable labels
3. **Filter results**: Use `FILTER`, `LIMIT`, and `ORDER BY` to control result size and order
4. **Test queries**: Test your SPARQL queries in the [Wikidata Query Service](https://query.wikidata.org/) before using them
5. **Handle images**: Use `wdt:P18` for images that will be automatically downloaded

For more examples, visit the [Wikidata SPARQL query examples](https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service/queries/examples) page.

| **Property**       | **Type**   | **Description**                                                                                                   | **Required** | **Default**             |
| ------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------- |
| `url`              | `string`   | SPARQL endpoint URL (e.g., `https://query.wikidata.org/sparql`)                                                   | ✅ Yes       | -                       |
| `sparql`           | `string`   | SPARQL query string. See [examples](https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service/queries/examples) | ✅ Yes       | -                       |
| `typeName`         | `string`   | GraphQL type name for the collection (must start with uppercase letter, alphanumeric only)                        | ✅ Yes       | -                       |
| `baseDir`          | `string`   | Base directory for downloaded files                                                                               | ❌ No        | `"/content/"`           |
| `cacheFilename`    | `string`   | Cache file name                                                                                                   | ❌ No        | `".cache.json"`         |
| `cacheEnabled`     | `boolean`  | Enable/disable caching                                                                                            | ❌ No        | `true`                  |
| `ttl`              | `number`   | Cache time-to-live in milliseconds (0 = infinite)                                                                 | ❌ No        | `86400000` (24 hours)   |
| `timeout`          | `number`   | HTTP request timeout in milliseconds                                                                              | ❌ No        | `30000` (30 seconds)    |
| `maxFileSize`      | `number`   | Maximum file size in bytes                                                                                        | ❌ No        | `104857600` (100 MB)    |
| `allowedFileTypes` | `string[]` | Array of allowed file extensions (e.g., `['jpg', 'png', 'pdf']`). If not specified, all types are allowed.        | ❌ No        | `undefined` (all types) |
| `rateLimitDelay`   | `number`   | Delay in milliseconds between requests (prevents hitting API rate limits). Set to `0` to disable.                 | ❌ No        | `100` (100ms)           |
| `verbose`          | `boolean`  | Enable verbose logging for debugging                                                                              | ❌ No        | `false`                 |

## Gridsome Compatibility

This plugin is compatible with:

- Gridsome `^0.7.0` or `^1.0.0`
- Node.js `>=20.0.0`

## Template Variables

### SPARQL to GraphQL Mapping

SPARQL query variables map directly to GraphQL fields. Variable names (without the `?` prefix) become field names in GraphQL:

- `?item` → `item` field (commonly used as node ID)
- `?paintingLabel` → `paintingLabel` field
- `?image` → `image` field (downloaded file path)
- `?author` → `author` field
- Any other `?variable` → `variable` field

### Node ID Generation

Gridsome requires each node to have a unique ID. The plugin handles this automatically:

1. If your SPARQL query includes a variable like `?item`, it will be used as the node ID
2. If no `?item` variable exists, Gridsome will auto-generate an ID from the first field
3. You can explicitly set an ID by including `?id` in your SPARQL query

**Best Practice**: Include `?item` in your SPARQL query to ensure consistent, readable IDs:

```sparql
SELECT ?item ?label ?image WHERE {
  ?item wdt:P31 wd:Q3305213;
    rdfs:label ?label;
    wdt:P18 ?image.
  BIND(REPLACE(STR(?item), "^.*/", "") AS ?item)
}
```

### Template Path Configuration

The `typeName` option determines the GraphQL collection name. Use it in your templates to create routes:

```javascript
// gridsome.config.js
module.exports = {
  plugins: [
    {
      use: "gridsome-source-wikidata",
      options: {
        typeName: "Painting",
        sparql: `SELECT ?item ?paintingLabel ?image WHERE {
          ?painting wdt:P31 wd:Q3305213;
            rdfs:label ?paintingLabel;
            wdt:P18 ?image.
          BIND(REPLACE(STR(?painting), "^.*/", "") AS ?item)
        }`
        // ...
      }
    }
  ],
  templates: {
    // Template path uses GraphQL field names (without ? prefix)
    Painting: "/painting/:item" // Uses the 'item' field from SPARQL
    // Alternative examples:
    // Painting: "/art/:item"     // Custom path with item ID
    // Painting: "/:paintingLabel" // Use label as path (if unique)
  }
};
```

### Template Path Variables

In your Vue templates, you can access all SPARQL variables as GraphQL fields:

```vue
<!-- src/templates/Painting.vue -->
<template>
  <Layout>
    <div>
      <h1>{{ $page.painting.paintingLabel }}</h1>
      <img :src="$page.painting.image" :alt="$page.painting.paintingLabel" />
      <p>Wikidata ID: {{ $page.painting.item }}</p>
    </div>
  </Layout>
</template>

<page-query>
query Painting ($id: ID!) {
  painting(id: $id) {
    item
    paintingLabel
    image
  }
}
</page-query>
```

**Note**: Template paths use the GraphQL field names (without the `?` prefix). The `:item` in the template path refers to the `item` field, which comes from the `?item` variable in your SPARQL query.

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
