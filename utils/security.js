// Rate limiting maps
const commandCooldowns = new Map()
const userRateLimits = new Map()

// Security settings
const COMMAND_COOLDOWNS = {
  default: 3000, // 3 seconds
  dashboard: 30000, // 30 seconds
  analytics: 60000, // 1 minute
  report: 120000, // 2 minutes
  search: 10000, // 10 seconds
  open: 15000, // 15 seconds
  priority: 5000, // 5 seconds
}

const USER_RATE_LIMITS = {
  commands: {
    limit: 20, // 20 commands
    window: 60000, // per minute
  },
  tickets: {
    limit: 3, // 3 tickets
    window: 3600000, // per hour
  },
  messages: {
    limit: 30, // 30 messages
    window: 60000, // per minute
  },
}

// Sensitive patterns to detect in logs and error messages
const SENSITIVE_PATTERNS = [
  /token=[A-Za-z0-9._-]+/gi,
  /api_?key=[\w-]+/gi,
  /password=\w+/gi,
  /secret=[\w-]+/gi,
  /authorization: Bearer [A-Za-z0-9._-]+/gi,
  /[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27}/g, // Discord token pattern
  /mfa\.[A-Za-z0-9_-]{84}/g, // Discord MFA token pattern
]

/**
 * Check if a command is on cooldown
 * @param {string} userId - The user ID
 * @param {string} commandName - The command name
 * @returns {Object} - Cooldown status and time left
 */
function checkCommandCooldown(userId, commandName) {
  const now = Date.now()
  const key = `${userId}-${commandName}`

  // Get cooldown time for this command
  const cooldownTime = COMMAND_COOLDOWNS[commandName] || COMMAND_COOLDOWNS.default

  if (commandCooldowns.has(key)) {
    const expirationTime = commandCooldowns.get(key) + cooldownTime

    if (now < expirationTime) {
      return {
        onCooldown: true,
        timeLeft: (expirationTime - now) / 1000,
      }
    }
  }

  // Set cooldown
  commandCooldowns.set(key, now)

  // Set timeout to delete the cooldown
  setTimeout(() => commandCooldowns.delete(key), cooldownTime)

  return {
    onCooldown: false,
    timeLeft: 0,
  }
}

/**
 * Check if a user has hit rate limits
 * @param {string} userId - The user ID
 * @param {string} type - The rate limit type (commands, tickets, messages)
 * @returns {Object} - Rate limit status and count
 */
function checkRateLimit(userId, type) {
  const now = Date.now()
  const key = `${userId}-${type}`

  // Get rate limit settings for this type
  const rateLimit = USER_RATE_LIMITS[type]
  if (!rateLimit) {
    return { limited: false, count: 0, limit: 0 }
  }

  // Initialize or get user's rate limit data
  if (!userRateLimits.has(key)) {
    userRateLimits.set(key, {
      count: 0,
      resetTime: now + rateLimit.window,
    })
  }

  const userData = userRateLimits.get(key)

  // Check if the rate limit window has expired
  if (now > userData.resetTime) {
    // Reset the count and set a new reset time
    userData.count = 1
    userData.resetTime = now + rateLimit.window
    userRateLimits.set(key, userData)

    return {
      limited: false,
      count: 1,
      limit: rateLimit.limit,
    }
  }

  // Increment the count
  userData.count++
  userRateLimits.set(key, userData)

  // Check if the user has exceeded the limit
  if (userData.count > rateLimit.limit) {
    return {
      limited: true,
      count: userData.count,
      limit: rateLimit.limit,
    }
  }

  return {
    limited: false,
    count: userData.count,
    limit: rateLimit.limit,
  }
}

/**
 * Sanitize user input to prevent injection attacks
 * @param {string} input - The user input to sanitize
 * @returns {string} - Sanitized input
 */
function sanitizeInput(input) {
  if (!input || typeof input !== "string") return ""

  // Replace potentially dangerous characters
  return input
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, '&#039;  "&lt;')
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
    .replace(/`/g, "&#096;")
    .replace(/\n/g, "<br>")
}

/**
 * Validate user input against a pattern
 * @param {string} input - The user input to validate
 * @param {RegExp} pattern - The pattern to validate against
 * @returns {boolean} - Whether the input is valid
 */
function validateInput(input, pattern) {
  if (!input || typeof input !== "string") return false

  return pattern.test(input)
}

/**
 * Check if a user has permission to use a command
 * @param {Object} member - The guild member
 * @param {Object} config - The guild configuration
 * @param {boolean} requireAdmin - Whether the command requires admin permissions
 * @returns {boolean} - Whether the user has permission
 */
function checkPermission(member, config, requireAdmin = false) {
  // Check if the user is an admin
  const isAdmin = member.permissions.has("Administrator")

  // If admin permissions are required, check if the user is an admin
  if (requireAdmin) {
    return isAdmin
  }

  // Otherwise, check if the user has the staff role
  const hasStaffRole = member.roles.cache.has(config.staffRoleId)

  return isAdmin || hasStaffRole
}

/**
 * Check if a channel is a staff channel
 * @param {string} channelId - The channel ID
 * @param {Object} config - The guild configuration
 * @returns {boolean} - Whether the channel is a staff channel
 */
function isStaffChannel(channelId, config) {
  return channelId === config.modmailChannelId || channelId === config.logChannelId
}

/**
 * Sanitize error messages to remove sensitive information
 * @param {string} message - The error message to sanitize
 * @returns {string} - Sanitized error message
 */
function sanitizeErrorMessage(message) {
  if (!message) return "An unknown error occurred"

  let sanitized = message

  // Replace sensitive patterns with redacted text
  SENSITIVE_PATTERNS.forEach((pattern) => {
    sanitized = sanitized.replace(pattern, "[REDACTED]")
  })

  return sanitized
}

/**
 * Validate webhook URL
 * @param {string} url - The webhook URL to validate
 * @returns {boolean} - Whether the URL is valid
 */
function isValidWebhookUrl(url) {
  if (!url) return false

  // Check if it's a Discord webhook URL
  const discordWebhookPattern = /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[\w-]+$/
  return discordWebhookPattern.test(url)
}

module.exports = {
  checkCommandCooldown,
  checkRateLimit,
  sanitizeInput,
  validateInput,
  checkPermission,
  isStaffChannel,
  sanitizeErrorMessage,
  isValidWebhookUrl,
}
