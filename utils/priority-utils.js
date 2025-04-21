/**
 * Priority utilities for consistent emoji and color representation
 */

// Priority emoji mapping
const PRIORITY_EMOJIS = {
  low: "🟢",
  medium: "🟡",
  high: "🟠",
  urgent: "🔴",
  default: "⚪",
}

// Priority name mapping
const PRIORITY_NAMES = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
  default: "Unknown",
}

// Priority color mapping (for embeds)
const PRIORITY_COLORS = {
  low: 0x00ff00, // Green
  medium: 0xffff00, // Yellow
  high: 0xff9900, // Orange
  urgent: 0xff0000, // Red
  default: 0x0099ff, // Blue
}

/**
 * Get the emoji for a priority level
 * @param {string} priority - The priority level
 * @returns {string} The emoji
 */
function getPriorityEmoji(priority) {
  return PRIORITY_EMOJIS[priority] || PRIORITY_EMOJIS.default
}

/**
 * Get the name for a priority level
 * @param {string} priority - The priority level
 * @returns {string} The name
 */
function getPriorityName(priority) {
  return PRIORITY_NAMES[priority] || PRIORITY_NAMES.default
}

/**
 * Get the color for a priority level
 * @param {string} priority - The priority level
 * @returns {number} The color (hex)
 */
function getPriorityColor(priority) {
  return PRIORITY_COLORS[priority] || PRIORITY_COLORS.default
}

/**
 * Get the formatted priority string with emoji
 * @param {string} priority - The priority level
 * @returns {string} Formatted priority string with emoji
 */
function getFormattedPriority(priority) {
  return `${getPriorityEmoji(priority)} ${getPriorityName(priority)}`
}

module.exports = {
  PRIORITY_EMOJIS,
  PRIORITY_NAMES,
  PRIORITY_COLORS,
  getPriorityEmoji,
  getPriorityName,
  getPriorityColor,
  getFormattedPriority,
}
