module.exports = {
  // Utility function to format timestamps
  formatTimestamp: (timestamp) => {
    return new Date(timestamp).toLocaleString()
  },

  // Utility function to generate a random ticket ID
  generateTicketId: () => {
    return Math.random().toString(36).substring(2, 10).toUpperCase()
  },

  // Utility function to truncate text
  truncate: (text, length) => {
    if (text.length <= length) return text
    return text.substring(0, length) + "..."
  },
}
