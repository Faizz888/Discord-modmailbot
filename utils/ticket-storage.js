const fs = require("fs")
const path = require("path")

class TicketStorage {
  constructor() {
    this.storagePath = path.join(__dirname, "../data/active-tickets.json")
    this.backupPath = path.join(__dirname, "../data/active-tickets-backup.json")
    this.ensureDirectoryExists()
  }

  ensureDirectoryExists() {
    const dir = path.dirname(this.storagePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  /**
   * Save active tickets to persistent storage
   * @param {Map} tickets - Map of active tickets
   */
  saveTickets(tickets) {
    try {
      // Convert Map to array for storage
      const ticketsArray = Array.from(tickets.values())

      // Create a backup of the current file if it exists
      if (fs.existsSync(this.storagePath)) {
        fs.copyFileSync(this.storagePath, this.backupPath)
      }

      // Write to temporary file first
      const tempPath = `${this.storagePath}.tmp`
      fs.writeFileSync(tempPath, JSON.stringify(ticketsArray, null, 2))

      // Rename temporary file to actual file (atomic operation)
      fs.renameSync(tempPath, this.storagePath)

      console.log(`Saved ${ticketsArray.length} active tickets to storage`)
    } catch (error) {
      console.error("Error saving tickets to storage:", error)

      // If we have a backup and the main file is corrupted, restore from backup
      if (fs.existsSync(this.backupPath)) {
        try {
          fs.copyFileSync(this.backupPath, this.storagePath)
          console.log("Restored tickets from backup file")
        } catch (backupError) {
          console.error("Failed to restore from backup:", backupError)
        }
      }
    }
  }

  /**
   * Load active tickets from persistent storage
   * @returns {Array} - Array of ticket objects
   */
  loadTickets() {
    try {
      if (!fs.existsSync(this.storagePath)) {
        // Try to load from backup if main file doesn't exist
        if (fs.existsSync(this.backupPath)) {
          console.log("Main ticket storage not found, attempting to load from backup")
          const backupData = fs.readFileSync(this.backupPath, "utf8")
          const tickets = JSON.parse(backupData)

          // Save to main file
          fs.writeFileSync(this.storagePath, backupData)

          console.log(`Loaded ${tickets.length} active tickets from backup storage`)
          return tickets
        }
        return []
      }

      const data = fs.readFileSync(this.storagePath, "utf8")

      try {
        const tickets = JSON.parse(data)
        console.log(`Loaded ${tickets.length} active tickets from storage`)
        return tickets
      } catch (parseError) {
        console.error("Error parsing ticket data, attempting to load from backup:", parseError)

        // Try to load from backup if main file is corrupted
        if (fs.existsSync(this.backupPath)) {
          const backupData = fs.readFileSync(this.backupPath, "utf8")
          const tickets = JSON.parse(backupData)

          // Save to main file
          fs.writeFileSync(this.storagePath, backupData)

          console.log(`Loaded ${tickets.length} active tickets from backup storage`)
          return tickets
        }

        throw parseError
      }
    } catch (error) {
      console.error("Error loading tickets from storage:", error)
      return []
    }
  }

  /**
   * Save a single ticket to storage
   * @param {Object} ticket - Ticket object
   * @param {Map} tickets - Map of all active tickets
   */
  saveTicket(ticket, tickets) {
    try {
      // Update the ticket in the map
      tickets.set(ticket.id, ticket)

      // Save all tickets
      this.saveTickets(tickets)
    } catch (error) {
      console.error("Error saving ticket to storage:", error)
    }
  }

  /**
   * Remove a ticket from storage
   * @param {string} ticketId - ID of the ticket to remove
   * @param {Map} tickets - Map of all active tickets
   */
  removeTicket(ticketId, tickets) {
    try {
      // Remove the ticket from the map
      tickets.delete(ticketId)

      // Save all tickets
      this.saveTickets(tickets)
    } catch (error) {
      console.error("Error removing ticket from storage:", error)
    }
  }

  /**
   * Verify ticket integrity and repair if needed
   * @param {Object} ticket - Ticket to verify
   * @returns {Object} - Verified and repaired ticket
   */
  verifyTicketIntegrity(ticket) {
    // Ensure all required fields exist
    if (!ticket.id) {
      console.warn(`Ticket missing ID, skipping: ${JSON.stringify(ticket)}`)
      return null
    }

    // Ensure status is valid
    if (!ticket.status || !["pending", "in_progress", "closed"].includes(ticket.status)) {
      console.warn(`Ticket ${ticket.id} has invalid status, setting to 'in_progress'`)
      ticket.status = "in_progress"
    }

    // Ensure dates are valid
    if (!ticket.createdAt) {
      console.warn(`Ticket ${ticket.id} missing createdAt, setting to current time`)
      ticket.createdAt = new Date().toISOString()
    }

    // Ensure numeric ID exists
    if (!ticket.numericId) {
      console.warn(`Ticket ${ticket.id} missing numericId, extracting from ID`)
      const parts = ticket.id.split("-")
      ticket.numericId = parts[parts.length - 1]
    }

    return ticket
  }
}

module.exports = new TicketStorage()
