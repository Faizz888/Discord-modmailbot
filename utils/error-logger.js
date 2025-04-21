const fs = require("fs")
const path = require("path")

class ErrorLogger {
  constructor() {
    this.logDir = path.join(__dirname, "../logs")
    this.ensureLogDirectory()
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true })
    }
  }

  /**
   * Sanitize error information to remove sensitive data
   * @param {Object} data - The data to sanitize
   * @returns {Object} - Sanitized data
   */
  sanitizeData(data) {
    if (!data) return {}

    // Create a deep copy to avoid modifying the original
    const sanitized = JSON.parse(JSON.stringify(data))

    // List of sensitive keys to redact
    const sensitiveKeys = [
      "token",
      "password",
      "secret",
      "key",
      "auth",
      "credential",
      "api_key",
      "apiKey",
      "api_secret",
      "apiSecret",
      "access_token",
      "accessToken",
      "refresh_token",
      "refreshToken",
      "private",
      "webhook",
    ]

    // Function to recursively sanitize an object
    const sanitizeObject = (obj) => {
      if (!obj || typeof obj !== "object") return obj

      Object.keys(obj).forEach((key) => {
        // Check if the key contains any sensitive words
        const isKeySensitive = sensitiveKeys.some((sk) => key.toLowerCase().includes(sk.toLowerCase()))

        if (isKeySensitive) {
          // Redact sensitive values
          obj[key] = "[REDACTED]"
        } else if (typeof obj[key] === "object") {
          // Recursively sanitize nested objects
          obj[key] = sanitizeObject(obj[key])
        }
      })

      return obj
    }

    return sanitizeObject(sanitized)
  }

  /**
   * Log an error to the console and to a file
   * @param {string} context - The context where the error occurred
   * @param {Error} error - The error object
   * @param {Object} additionalInfo - Additional information about the error
   */
  logError(context, error, additionalInfo = {}) {
    const timestamp = new Date().toISOString()

    // Sanitize error information
    const sanitizedInfo = this.sanitizeData(additionalInfo)

    // Create a sanitized error object
    const sanitizedError = {
      message: error.message,
      name: error.name,
      // Only include stack in development environment
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    }

    const logEntry = {
      timestamp,
      context,
      error: sanitizedError,
      additionalInfo: sanitizedInfo,
    }

    // Log to console (with limited information)
    console.error(`[ERROR] [${timestamp}] [${context}]`, error.message)

    // Only log stack trace in development
    if (process.env.NODE_ENV === "development" && error.stack) {
      console.error(error.stack)
    }

    // Log to file
    const logFile = path.join(this.logDir, `error-${new Date().toISOString().split("T")[0]}.log`)
    fs.appendFileSync(logFile, JSON.stringify(logEntry, null, 2) + "\n\n")

    return logEntry
  }

  /**
   * Log a warning to the console and to a file
   * @param {string} context - The context where the warning occurred
   * @param {string} message - The warning message
   * @param {Object} additionalInfo - Additional information about the warning
   */
  logWarning(context, message, additionalInfo = {}) {
    const timestamp = new Date().toISOString()

    // Sanitize additional information
    const sanitizedInfo = this.sanitizeData(additionalInfo)

    const logEntry = {
      timestamp,
      context,
      message,
      additionalInfo: sanitizedInfo,
    }

    // Log to console
    console.warn(`[WARNING] [${timestamp}] [${context}]`, message)

    // Log to file
    const logFile = path.join(this.logDir, `warning-${new Date().toISOString().split("T")[0]}.log`)
    fs.appendFileSync(logFile, JSON.stringify(logEntry, null, 2) + "\n\n")

    return logEntry
  }

  /**
   * Log an info message to the console and to a file
   * @param {string} context - The context where the info is logged
   * @param {string} message - The info message
   * @param {Object} additionalInfo - Additional information
   */
  logInfo(context, message, additionalInfo = {}) {
    const timestamp = new Date().toISOString()

    // Sanitize additional information
    const sanitizedInfo = this.sanitizeData(additionalInfo)

    const logEntry = {
      timestamp,
      context,
      message,
      additionalInfo: sanitizedInfo,
    }

    // Log to console
    console.log(`[INFO] [${timestamp}] [${context}]`, message)

    // Log to file
    const logFile = path.join(this.logDir, `info-${new Date().toISOString().split("T")[0]}.log`)
    fs.appendFileSync(logFile, JSON.stringify(logEntry, null, 2) + "\n\n")

    return logEntry
  }

  /**
   * Log a security event to a separate security log file
   * @param {string} context - The security context
   * @param {string} event - The security event description
   * @param {Object} data - Additional security event data
   */
  logSecurityEvent(context, event, data = {}) {
    const timestamp = new Date().toISOString()

    // Sanitize security data
    const sanitizedData = this.sanitizeData(data)

    const logEntry = {
      timestamp,
      context,
      event,
      data: sanitizedData,
    }

    // Log to console with minimal information
    console.warn(`[SECURITY] [${timestamp}] [${context}]`, event)

    // Log to a separate security log file
    const logFile = path.join(this.logDir, `security-${new Date().toISOString().split("T")[0]}.log`)
    fs.appendFileSync(logFile, JSON.stringify(logEntry, null, 2) + "\n\n")

    return logEntry
  }
}

module.exports = new ErrorLogger()
