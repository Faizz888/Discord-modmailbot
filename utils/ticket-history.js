const fs = require("fs")
const path = require("path")

class TicketHistory {
  constructor() {
    this.historyPath = path.join(__dirname, "../data/ticket-history.json")
    this.counterPath = path.join(__dirname, "../data/ticket-counters.json")
    this.ensureDirectoryExists()
    this.loadHistory()
    this.loadCounters()
  }

  ensureDirectoryExists() {
    const dir = path.dirname(this.historyPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  loadHistory() {
    try {
      if (fs.existsSync(this.historyPath)) {
        const data = fs.readFileSync(this.historyPath, "utf8")
        this.history = JSON.parse(data)
      } else {
        this.history = {
          tickets: [],
          users: {},
          servers: {},
          stats: {
            totalTickets: 0,
            closedTickets: 0,
            categoryCounts: {},
            tagCounts: {},
          },
        }
        this.saveHistory()
      }
    } catch (error) {
      console.error("Error loading ticket history:", error)
      this.history = {
        tickets: [],
        users: {},
        servers: {},
        stats: {
          totalTickets: 0,
          closedTickets: 0,
          categoryCounts: {},
          tagCounts: {},
        },
      }
    }
  }

  loadCounters() {
    try {
      if (fs.existsSync(this.counterPath)) {
        const data = fs.readFileSync(this.counterPath, "utf8")
        this.counters = JSON.parse(data)
      } else {
        this.counters = {}
        this.saveCounters()
      }
    } catch (error) {
      console.error("Error loading ticket counters:", error)
      this.counters = {}
    }
  }

  saveHistory() {
    try {
      fs.writeFileSync(this.historyPath, JSON.stringify(this.history, null, 2))
    } catch (error) {
      console.error("Error saving ticket history:", error)
    }
  }

  saveCounters() {
    try {
      fs.writeFileSync(this.counterPath, JSON.stringify(this.counters, null, 2))
    } catch (error) {
      console.error("Error saving ticket counters:", error)
    }
  }

  getNextTicketId(guildId) {
    if (!this.counters[guildId]) {
      this.counters[guildId] = 0
    }

    this.counters[guildId]++
    this.saveCounters()

    // Format as 4-digit number with leading zeros
    return this.counters[guildId].toString().padStart(4, "0")
  }

  addTicket(ticket, messages = []) {
    // Process messages to ensure they're in the right format
    const processedMessages = messages.map((msg) => {
      // For embeds, extract the relevant information
      if (msg.embeds && msg.embeds.length > 0) {
        const embed = msg.embeds[0]
        const isStaff = embed.author && embed.author.name.includes("Staff")

        return {
          id: msg.id,
          author: embed.author ? embed.author.name : "Unknown",
          authorId: isStaff
            ? embed.footer && embed.footer.text.includes("ID:")
              ? embed.footer.text.split("ID:")[1].trim()
              : "Unknown"
            : ticket.userId || "Unknown",
          content: embed.description || "",
          timestamp: msg.createdTimestamp,
          isStaff: isStaff,
          attachments:
            embed.fields && embed.fields.some((f) => f.name === "Attachments")
              ? embed.fields.find((f) => f.name === "Attachments").value
              : null,
        }
      }

      // For regular messages
      return {
        id: msg.id,
        author: msg.author.tag,
        authorId: msg.author.id,
        content: msg.content,
        timestamp: msg.createdTimestamp,
        isStaff: msg.member && msg.member.roles.cache.has(ticket.staffRoleId),
        attachments:
          msg.attachments.size > 0
            ? Array.from(msg.attachments.values())
                .map((a) => a.url)
                .join(", ")
            : null,
      }
    })

    // Create a ticket record with enhanced information
    const ticketRecord = {
      id: ticket.id,
      numericId: ticket.numericId,
      userId: ticket.userId,
      userTag: ticket.userTag || "Unknown",
      guildId: ticket.guildId,
      threadId: ticket.threadId || null,
      createdAt: ticket.createdAt,
      closedAt: new Date().toISOString(),
      closedBy: ticket.closedBy || null,
      closeReason: ticket.closeReason || null,
      status: "closed",
      category: ticket.category || null,
      priority: ticket.priority || null,
      tags: ticket.tags || [],
      assignedTo: ticket.assignedTo || null,
      assignedToTag: ticket.assignedToTag || null,
      firstResponseTime: ticket.firstResponseTime || null,
      resolutionTime: ticket.resolutionTime || null,
      satisfactionRating: ticket.satisfactionRating || null,
      satisfactionFeedback: ticket.satisfactionFeedback || null,
      messageCount: processedMessages.length,
      staffMessageCount: processedMessages.filter((m) => m.isStaff).length,
      userMessageCount: processedMessages.filter((m) => !m.isStaff).length,
      messages: processedMessages,
      events: ticket.events || [],
    }

    // Add to tickets array
    this.history.tickets.push(ticketRecord)

    // Update global stats
    this.history.stats.totalTickets++
    this.history.stats.closedTickets++

    // Update category stats
    if (ticket.category) {
      if (!this.history.stats.categoryCounts[ticket.category]) {
        this.history.stats.categoryCounts[ticket.category] = 0
      }
      this.history.stats.categoryCounts[ticket.category]++
    }

    // Update tag stats
    if (ticket.tags && ticket.tags.length > 0) {
      ticket.tags.forEach((tag) => {
        if (!this.history.stats.tagCounts[tag]) {
          this.history.stats.tagCounts[tag] = 0
        }
        this.history.stats.tagCounts[tag]++
      })
    }

    // Update user history
    if (!this.history.users[ticket.userId]) {
      this.history.users[ticket.userId] = {
        tickets: [],
        totalTickets: 0,
        tags: {},
        categories: {},
        ratings: [],
        averageRating: null,
      }
    }

    const userHistory = this.history.users[ticket.userId]
    userHistory.tickets.push(ticket.id)
    userHistory.totalTickets++

    // Update user tag stats
    if (ticket.tags && ticket.tags.length > 0) {
      ticket.tags.forEach((tag) => {
        if (!userHistory.tags[tag]) {
          userHistory.tags[tag] = 0
        }
        userHistory.tags[tag]++
      })
    }

    // Update user category stats
    if (ticket.category) {
      if (!userHistory.categories[ticket.category]) {
        userHistory.categories[ticket.category] = 0
      }
      userHistory.categories[ticket.category]++
    }

    // Update user satisfaction ratings
    if (ticket.satisfactionRating) {
      userHistory.ratings.push(ticket.satisfactionRating)
      userHistory.averageRating = userHistory.ratings.reduce((a, b) => a + b, 0) / userHistory.ratings.length
    }

    // Update server stats
    if (!this.history.servers[ticket.guildId]) {
      this.history.servers[ticket.guildId] = {
        tickets: [],
        totalTickets: 0,
        closedTickets: 0,
        categories: {},
        tags: {},
        users: {},
        staff: {},
      }
    }

    const serverHistory = this.history.servers[ticket.guildId]
    serverHistory.tickets.push(ticket.id)
    serverHistory.totalTickets++
    serverHistory.closedTickets++

    // Update server category stats
    if (ticket.category) {
      if (!serverHistory.categories[ticket.category]) {
        serverHistory.categories[ticket.category] = 0
      }
      serverHistory.categories[ticket.category]++
    }

    // Update server tag stats
    if (ticket.tags && ticket.tags.length > 0) {
      ticket.tags.forEach((tag) => {
        if (!serverHistory.tags[tag]) {
          serverHistory.tags[tag] = 0
        }
        serverHistory.tags[tag]++
      })
    }

    // Update server user stats
    if (!serverHistory.users[ticket.userId]) {
      serverHistory.users[ticket.userId] = {
        tickets: [],
        totalTickets: 0,
      }
    }
    serverHistory.users[ticket.userId].tickets.push(ticket.id)
    serverHistory.users[ticket.userId].totalTickets++

    // Update server staff stats
    if (ticket.assignedTo) {
      if (!serverHistory.staff[ticket.assignedTo]) {
        serverHistory.staff[ticket.assignedTo] = {
          tickets: [],
          totalTickets: 0,
          ratings: [],
          averageRating: null,
        }
      }

      const staffHistory = serverHistory.staff[ticket.assignedTo]
      staffHistory.tickets.push(ticket.id)
      staffHistory.totalTickets++

      if (ticket.satisfactionRating) {
        staffHistory.ratings.push(ticket.satisfactionRating)
        staffHistory.averageRating = staffHistory.ratings.reduce((a, b) => a + b, 0) / staffHistory.ratings.length
      }

      if (ticket.assignedToDisplayName) {
        serverHistory.staff[ticket.assignedTo].displayName = ticket.assignedToDisplayName
      }
    }

    // Save the updated history
    this.saveHistory()

    return ticketRecord
  }

  updateTicket(ticketId, updates) {
    const ticketIndex = this.history.tickets.findIndex((t) => t.id === ticketId)

    if (ticketIndex === -1) return null

    // Apply updates
    const ticket = this.history.tickets[ticketIndex]
    const updatedTicket = { ...ticket, ...updates }

    // If updating satisfaction rating, update user stats too
    if (updates.satisfactionRating && ticket.userId) {
      const userHistory = this.history.users[ticket.userId]

      if (userHistory) {
        userHistory.ratings.push(updates.satisfactionRating)
        userHistory.averageRating = userHistory.ratings.reduce((a, b) => a + b, 0) / userHistory.ratings.length
      }

      // Update server staff stats
      if (ticket.assignedTo && ticket.guildId) {
        const serverHistory = this.history.servers[ticket.guildId]
        if (serverHistory && serverHistory.staff[ticket.assignedTo]) {
          const staffHistory = serverHistory.staff[ticket.assignedTo]
          staffHistory.ratings.push(updates.satisfactionRating)
          staffHistory.averageRating = staffHistory.ratings.reduce((a, b) => a + b, 0) / staffHistory.ratings.length
        }
      }
    }

    // Update the ticket
    this.history.tickets[ticketIndex] = updatedTicket

    // Save changes
    this.saveHistory()

    return updatedTicket
  }

  getUserTickets(userId) {
    if (!this.history.users[userId]) {
      return []
    }

    return this.history.users[userId].tickets
      .map((ticketId) => this.history.tickets.find((t) => t.id === ticketId))
      .filter(Boolean)
  }

  getTicket(ticketId) {
    return this.history.tickets.find((t) => t.id === ticketId)
  }

  getTicketByNumericId(guildId, numericId) {
    return this.history.tickets.find((t) => t.guildId === guildId && t.numericId === numericId)
  }

  getAllTickets() {
    return this.history.tickets
  }

  getTicketsByGuild(guildId) {
    return this.history.tickets.filter((t) => t.guildId === guildId)
  }

  searchTickets(criteria = {}) {
    let results = this.history.tickets

    // Filter by guild ID
    if (criteria.guildId) {
      results = results.filter((t) => t.guildId === criteria.guildId)
    }

    // Filter by user ID
    if (criteria.userId) {
      results = results.filter((t) => t.userId === criteria.userId)
    }

    // Filter by username (partial match)
    if (criteria.username) {
      const lowercaseUsername = criteria.username.toLowerCase()
      results = results.filter((t) => t.userTag && t.userTag.toLowerCase().includes(lowercaseUsername))
    }

    // Filter by ticket ID (partial match)
    if (criteria.ticketId) {
      results = results.filter((t) => t.id.includes(criteria.ticketId) || t.numericId === criteria.ticketId)
    }

    // Filter by category
    if (criteria.category) {
      results = results.filter((t) => t.category === criteria.category)
    }

    // Filter by tags (any match)
    if (criteria.tags && criteria.tags.length > 0) {
      results = results.filter((t) => t.tags && t.tags.some((tag) => criteria.tags.includes(tag)))
    }

    // Filter by content (search in messages)
    if (criteria.content) {
      const lowercaseContent = criteria.content.toLowerCase()
      results = results.filter(
        (t) => t.messages && t.messages.some((m) => m.content && m.content.toLowerCase().includes(lowercaseContent)),
      )
    }

    // Filter by date range
    if (criteria.startDate) {
      const startDate = new Date(criteria.startDate)
      results = results.filter((t) => new Date(t.createdAt) >= startDate)
    }

    if (criteria.endDate) {
      const endDate = new Date(criteria.endDate)
      results = results.filter((t) => new Date(t.createdAt) <= endDate)
    }

    // Filter by staff member
    if (criteria.staffId) {
      results = results.filter((t) => t.assignedTo === criteria.staffId)
    }

    // Filter by satisfaction rating
    if (criteria.minRating) {
      results = results.filter((t) => t.satisfactionRating && t.satisfactionRating >= criteria.minRating)
    }

    if (criteria.maxRating) {
      results = results.filter((t) => t.satisfactionRating && t.satisfactionRating <= criteria.maxRating)
    }

    return results
  }

  getStats() {
    return this.history.stats
  }

  getServerStats(guildId) {
    return this.history.servers[guildId] || null
  }

  getUserStats(userId) {
    return this.history.users[userId] || null
  }

  getAllUserStats() {
    return this.history.users
  }

  getAllServerStats() {
    return this.history.servers
  }
}

module.exports = new TicketHistory()
