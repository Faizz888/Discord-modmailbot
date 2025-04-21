const fs = require("fs")
const path = require("path")

class JsonValidator {
  constructor() {
    this.validationResults = {}
  }

  /**
   * Validate a JSON file
   * @param {string} filePath - Path to the JSON file
   * @param {Object} schema - Optional schema to validate against
   * @returns {Object} - Validation result
   */
  validateFile(filePath, schema = null) {
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return {
          valid: false,
          error: `File does not exist: ${filePath}`,
          data: null,
        }
      }

      // Read file
      const fileContent = fs.readFileSync(filePath, "utf8")

      // Parse JSON
      let data
      try {
        data = JSON.parse(fileContent)
      } catch (error) {
        return {
          valid: false,
          error: `Invalid JSON format: ${error.message}`,
          data: null,
        }
      }

      // Validate against schema if provided
      if (schema) {
        const schemaValidation = this.validateAgainstSchema(data, schema)
        if (!schemaValidation.valid) {
          return {
            valid: false,
            error: schemaValidation.error,
            data,
          }
        }
      }

      // Store validation result
      this.validationResults[filePath] = {
        valid: true,
        lastValidated: new Date(),
        data,
      }

      return {
        valid: true,
        data,
      }
    } catch (error) {
      return {
        valid: false,
        error: `Validation error: ${error.message}`,
        data: null,
      }
    }
  }

  /**
   * Validate data against a schema
   * @param {Object} data - The data to validate
   * @param {Object} schema - The schema to validate against
   * @returns {Object} - Validation result
   */
  validateAgainstSchema(data, schema) {
    try {
      // Simple schema validation
      for (const key in schema) {
        const fieldSchema = schema[key]

        // Check required fields
        if (fieldSchema.required && (data[key] === undefined || data[key] === null)) {
          return {
            valid: false,
            error: `Required field missing: ${key}`,
          }
        }

        // Skip validation for optional fields that are not present
        if (data[key] === undefined || data[key] === null) {
          continue
        }

        // Check type
        if (fieldSchema.type && typeof data[key] !== fieldSchema.type) {
          return {
            valid: false,
            error: `Invalid type for field ${key}: expected ${fieldSchema.type}, got ${typeof data[key]}`,
          }
        }

        // Check array
        if (fieldSchema.type === "array" && !Array.isArray(data[key])) {
          return {
            valid: false,
            error: `Invalid type for field ${key}: expected array, got ${typeof data[key]}`,
          }
        }

        // Check nested objects
        if (fieldSchema.properties && typeof data[key] === "object" && !Array.isArray(data[key])) {
          const nestedValidation = this.validateAgainstSchema(data[key], fieldSchema.properties)
          if (!nestedValidation.valid) {
            return {
              valid: false,
              error: `Invalid nested object for field ${key}: ${nestedValidation.error}`,
            }
          }
        }

        // Check array items
        if (fieldSchema.items && Array.isArray(data[key])) {
          for (let i = 0; i < data[key].length; i++) {
            const itemValidation = this.validateAgainstSchema(data[key][i], fieldSchema.items)
            if (!itemValidation.valid) {
              return {
                valid: false,
                error: `Invalid array item at index ${i} for field ${key}: ${itemValidation.error}`,
              }
            }
          }
        }

        // Check enum values
        if (fieldSchema.enum && !fieldSchema.enum.includes(data[key])) {
          return {
            valid: false,
            error: `Invalid value for field ${key}: expected one of [${fieldSchema.enum.join(", ")}], got ${data[key]}`,
          }
        }
      }

      return { valid: true }
    } catch (error) {
      return {
        valid: false,
        error: `Schema validation error: ${error.message}`,
      }
    }
  }

  /**
   * Validate all JSON files in a directory
   * @param {string} directory - Directory to validate
   * @param {Object} schemas - Map of file names to schemas
   * @returns {Object} - Validation results
   */
  validateDirectory(directory, schemas = {}) {
    const results = {}

    try {
      // Check if directory exists
      if (!fs.existsSync(directory)) {
        return {
          valid: false,
          error: `Directory does not exist: ${directory}`,
          results: {},
        }
      }

      // Get all JSON files in directory
      const files = fs.readdirSync(directory).filter((file) => file.endsWith(".json"))

      // Validate each file
      for (const file of files) {
        const filePath = path.join(directory, file)
        const schema = schemas[file] || null
        results[file] = this.validateFile(filePath, schema)
      }

      return {
        valid: Object.values(results).every((result) => result.valid),
        results,
      }
    } catch (error) {
      return {
        valid: false,
        error: `Directory validation error: ${error.message}`,
        results,
      }
    }
  }

  /**
   * Repair a JSON file if possible
   * @param {string} filePath - Path to the JSON file
   * @param {Object} defaultData - Default data to use if file is invalid
   * @returns {Object} - Repair result
   */
  repairFile(filePath, defaultData = {}) {
    try {
      // Validate file first
      const validation = this.validateFile(filePath)

      // If valid, no need to repair
      if (validation.valid) {
        return {
          repaired: false,
          message: "File is valid, no repair needed",
          data: validation.data,
        }
      }

      // Create directory if it doesn't exist
      const directory = path.dirname(filePath)
      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true })
      }

      // Write default data to file
      fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2))

      return {
        repaired: true,
        message: `File repaired with default data: ${validation.error}`,
        data: defaultData,
      }
    } catch (error) {
      return {
        repaired: false,
        error: `Repair error: ${error.message}`,
        data: null,
      }
    }
  }

  /**
   * Get schemas for common JSON files
   * @returns {Object} - Map of file names to schemas
   */
  getCommonSchemas() {
    return {
      "config.json": {
        // Schema for config.json
        guildId: { type: "string", required: true },
        modmailChannelId: { type: "string", required: true },
        logChannelId: { type: "string", required: true },
        staffRoleId: { type: "string", required: true },
        useThreads: { type: "boolean", required: false },
        webhookUrl: { type: "string", required: false },
        adminChannels: { type: "array", required: false },
        setupBy: { type: "string", required: false },
        setupAt: { type: "string", required: false },
      },
      "blacklist.json": {
        // Schema for blacklist.json - this is a nested structure
        // with guild IDs as keys and user blacklists as values
        "*": {
          // Wildcard for guild IDs
          "*": {
            // Wildcard for user IDs
            username: { type: "string", required: true },
            reason: { type: "string", required: true },
            blacklistedBy: { type: "string", required: true },
            blacklistedAt: { type: "string", required: true },
          },
        },
      },
      "snippets.json": {
        // Schema for snippets.json - similar nested structure
        "*": {
          // Wildcard for guild IDs
          "*": {
            // Wildcard for snippet names
            type: "string",
            required: true,
          },
        },
      },
      "ticket-history.json": {
        // Schema for ticket history
        tickets: { type: "array", required: true },
        users: { type: "object", required: true },
        servers: { type: "object", required: true },
        stats: {
          type: "object",
          required: true,
          properties: {
            totalTickets: { type: "number", required: true },
            closedTickets: { type: "number", required: true },
            categoryCounts: { type: "object", required: true },
            tagCounts: { type: "object", required: true },
          },
        },
      },
    }
  }
}

module.exports = new JsonValidator()
