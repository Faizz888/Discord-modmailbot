const ticketHistory = require("./ticket-history")

class TicketAnalytics {
  constructor() {
    this.ticketHistory = ticketHistory
  }

  getBasicStats(guildId, timeRange = 30) {
    // Get tickets for the specified guild
    const allTickets = this.ticketHistory.getTicketsByGuild(guildId)

    // Filter by time range (days)
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - timeRange)

    const tickets = allTickets.filter((ticket) => {
      const createdAt = new Date(ticket.createdAt)
      return createdAt >= cutoffDate
    })

    // Calculate basic stats
    const totalTickets = tickets.length
    const closedTickets = tickets.filter((t) => t.status === "closed").length
    const categoryCounts = this.getCategoryCounts(tickets)
    const priorityCounts = this.getPriorityCounts(tickets)
    const tagCounts = this.getTagCounts(tickets)
    const avgResponseTime = this.getAverageResponseTime(tickets)
    const avgResolutionTime = this.getAverageResolutionTime(tickets)
    const ticketsPerDay = this.getTicketsPerDay(tickets, timeRange)
    const topUsers = this.getTopUsers(tickets)
    const topStaff = this.getTopStaff(tickets)
    const satisfactionStats = this.getSatisfactionStats(tickets)

    return {
      totalTickets,
      closedTickets,
      openRate: totalTickets > 0 ? ((closedTickets / totalTickets) * 100).toFixed(2) + "%" : "0%",
      categoryCounts,
      priorityCounts,
      tagCounts,
      avgResponseTime,
      avgResolutionTime,
      ticketsPerDay,
      topUsers,
      topStaff,
      satisfactionStats,
    }
  }

  getCategoryCounts(tickets) {
    const categories = {}

    tickets.forEach((ticket) => {
      const category = ticket.category || "uncategorized"
      if (!categories[category]) {
        categories[category] = 0
      }
      categories[category]++
    })

    return categories
  }

  getPriorityCounts(tickets) {
    const priorities = {}

    tickets.forEach((ticket) => {
      const priority = ticket.priority || "unset"
      if (!priorities[priority]) {
        priorities[priority] = 0
      }
      priorities[priority]++
    })

    return priorities
  }

  getTagCounts(tickets) {
    const tags = {}

    tickets.forEach((ticket) => {
      if (ticket.tags && ticket.tags.length > 0) {
        ticket.tags.forEach((tag) => {
          if (!tags[tag]) {
            tags[tag] = 0
          }
          tags[tag]++
        })
      }
    })

    return tags
  }

  getAverageResponseTime(tickets) {
    const ticketsWithResponse = tickets.filter((t) => t.firstResponseTime)

    if (ticketsWithResponse.length === 0) {
      return "N/A"
    }

    const totalResponseTime = ticketsWithResponse.reduce((sum, ticket) => {
      const createdAt = new Date(ticket.createdAt)
      const firstResponse = new Date(ticket.firstResponseTime)
      return sum + (firstResponse - createdAt)
    }, 0)

    // Average in milliseconds
    const avgResponseTime = totalResponseTime / ticketsWithResponse.length

    // Convert to minutes
    return (avgResponseTime / 60000).toFixed(2) + " minutes"
  }

  getAverageResolutionTime(tickets) {
    const closedTickets = tickets.filter((t) => t.status === "closed" && t.closedAt)

    if (closedTickets.length === 0) {
      return "N/A"
    }

    const totalResolutionTime = closedTickets.reduce((sum, ticket) => {
      const createdAt = new Date(ticket.createdAt)
      const closedAt = new Date(ticket.closedAt)
      return sum + (closedAt - createdAt)
    }, 0)

    // Average in milliseconds
    const avgResolutionTime = totalResolutionTime / closedTickets.length

    // Convert to hours
    return (avgResolutionTime / 3600000).toFixed(2) + " hours"
  }

  getTicketsPerDay(tickets, timeRange) {
    const days = {}
    const now = new Date()

    // Initialize all days in the range
    for (let i = 0; i < timeRange; i++) {
      const date = new Date()
      date.setDate(now.getDate() - i)
      const dateString = date.toISOString().split("T")[0]
      days[dateString] = 0
    }

    // Count tickets per day
    tickets.forEach((ticket) => {
      const dateString = new Date(ticket.createdAt).toISOString().split("T")[0]
      if (days[dateString] !== undefined) {
        days[dateString]++
      }
    })

    return days
  }

  getTopUsers(tickets) {
    const users = {}

    tickets.forEach((ticket) => {
      if (!users[ticket.userId]) {
        users[ticket.userId] = {
          userId: ticket.userId,
          userTag: ticket.userTag || "Unknown",
          count: 0,
        }
      }
      users[ticket.userId].count++
    })

    // Convert to array and sort
    return Object.values(users)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  }

  getTopStaff(tickets) {
    const staff = {}

    tickets.forEach((ticket) => {
      if (ticket.assignedTo) {
        if (!staff[ticket.assignedTo]) {
          staff[ticket.assignedTo] = {
            staffId: ticket.assignedTo,
            staffTag: ticket.assignedToTag || "Unknown",
            count: 0,
            ratings: [],
          }
        }
        staff[ticket.assignedTo].count++

        if (ticket.satisfactionRating) {
          staff[ticket.assignedTo].ratings.push(ticket.satisfactionRating)
        }
      }
    })

    // Calculate average ratings
    Object.values(staff).forEach((staffMember) => {
      if (staffMember.ratings.length > 0) {
        staffMember.averageRating = (
          staffMember.ratings.reduce((sum, rating) => sum + rating, 0) / staffMember.ratings.length
        ).toFixed(2)
      } else {
        staffMember.averageRating = "N/A"
      }
    })

    // Convert to array and sort
    return Object.values(staff)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  }

  getSatisfactionStats(tickets) {
    const ticketsWithRatings = tickets.filter((t) => t.satisfactionRating)

    if (ticketsWithRatings.length === 0) {
      return {
        averageRating: "N/A",
        ratingCounts: {},
        ratedTickets: 0,
        totalTickets: tickets.length,
        ratingPercentage: "0%",
      }
    }

    // Calculate average rating
    const totalRating = ticketsWithRatings.reduce((sum, ticket) => sum + ticket.satisfactionRating, 0)
    const averageRating = (totalRating / ticketsWithRatings.length).toFixed(2)

    // Count ratings by value
    const ratingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    ticketsWithRatings.forEach((ticket) => {
      ratingCounts[ticket.satisfactionRating]++
    })

    return {
      averageRating,
      ratingCounts,
      ratedTickets: ticketsWithRatings.length,
      totalTickets: tickets.length,
      ratingPercentage: ((ticketsWithRatings.length / tickets.length) * 100).toFixed(2) + "%",
    }
  }

  generateTimeRangeReport(guildId, startDate, endDate) {
    // Get tickets for the specified guild
    const allTickets = this.ticketHistory.getTicketsByGuild(guildId)

    // Filter by date range
    const start = new Date(startDate)
    const end = new Date(endDate)

    const tickets = allTickets.filter((ticket) => {
      const createdAt = new Date(ticket.createdAt)
      return createdAt >= start && createdAt <= end
    })

    // Use the basic stats function with the filtered tickets
    return this.getBasicStats(guildId, tickets)
  }

  getStaffPerformance(guildId, timeRange = 30) {
    // Get tickets for the specified guild
    const allTickets = this.ticketHistory.getTicketsByGuild(guildId)

    // Filter by time range (days)
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - timeRange)

    const tickets = allTickets.filter((ticket) => {
      const createdAt = new Date(ticket.createdAt)
      return createdAt >= cutoffDate
    })

    // Group tickets by staff member
    const staffPerformance = {}

    tickets.forEach((ticket) => {
      if (ticket.assignedTo) {
        if (!staffPerformance[ticket.assignedTo]) {
          staffPerformance[ticket.assignedTo] = {
            staffId: ticket.assignedTo,
            staffTag: ticket.assignedToTag || "Unknown",
            ticketsHandled: 0,
            ticketsClosed: 0,
            ratings: [],
            averageRating: "N/A",
            responseTimes: [],
            averageResponseTime: "N/A",
            resolutionTimes: [],
            averageResolutionTime: "N/A",
            categories: {},
            tags: {},
          }
        }

        const staff = staffPerformance[ticket.assignedTo]

        // Count tickets
        staff.ticketsHandled++
        if (ticket.status === "closed") {
          staff.ticketsClosed++
        }

        // Track ratings
        if (ticket.satisfactionRating) {
          staff.ratings.push(ticket.satisfactionRating)
        }

        // Track response times
        if (ticket.firstResponseTime) {
          const responseTime = new Date(ticket.firstResponseTime) - new Date(ticket.createdAt)
          staff.responseTimes.push(responseTime)
        }

        // Track resolution times
        if (ticket.status === "closed" && ticket.closedAt) {
          const resolutionTime = new Date(ticket.closedAt) - new Date(ticket.createdAt)
          staff.resolutionTimes.push(resolutionTime)
        }

        // Track categories
        if (ticket.category) {
          if (!staff.categories[ticket.category]) {
            staff.categories[ticket.category] = 0
          }
          staff.categories[ticket.category]++
        }

        // Track tags
        if (ticket.tags && ticket.tags.length > 0) {
          ticket.tags.forEach((tag) => {
            if (!staff.tags[tag]) {
              staff.tags[tag] = 0
            }
            staff.tags[tag]++
          })
        }
      }
    })

    // Calculate averages
    Object.values(staffPerformance).forEach((staff) => {
      // Average rating
      if (staff.ratings.length > 0) {
        staff.averageRating = (staff.ratings.reduce((sum, rating) => sum + rating, 0) / staff.ratings.length).toFixed(2)
      }

      // Average response time
      if (staff.responseTimes.length > 0) {
        const avgResponseMs = staff.responseTimes.reduce((sum, time) => sum + time, 0) / staff.responseTimes.length
        staff.averageResponseTime = (avgResponseMs / 60000).toFixed(2) + " minutes"
      }

      // Average resolution time
      if (staff.resolutionTimes.length > 0) {
        const avgResolutionMs =
          staff.resolutionTimes.reduce((sum, time) => sum + time, 0) / staff.resolutionTimes.length
        staff.averageResolutionTime = (avgResolutionMs / 3600000).toFixed(2) + " hours"
      }

      // Calculate close rate
      staff.closeRate =
        staff.ticketsHandled > 0 ? ((staff.ticketsClosed / staff.ticketsHandled) * 100).toFixed(2) + "%" : "0%"
    })

    return Object.values(staffPerformance).sort((a, b) => b.ticketsHandled - a.ticketsHandled)
  }

  generateCustomReport(guildId, options = {}) {
    const {
      timeRange = 30,
      startDate = null,
      endDate = null,
      staffId = null,
      category = null,
      tags = [],
      metrics = ["tickets", "response", "resolution", "satisfaction"],
    } = options

    // Get tickets based on date range
    let tickets

    if (startDate && endDate) {
      tickets = this.ticketHistory.searchTickets({
        guildId,
        startDate,
        endDate,
      })
    } else {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - timeRange)

      tickets = this.ticketHistory.searchTickets({
        guildId,
        startDate: cutoffDate.toISOString(),
      })
    }

    // Apply additional filters
    if (staffId) {
      tickets = tickets.filter((t) => t.assignedTo === staffId)
    }

    if (category) {
      tickets = tickets.filter((t) => t.category === category)
    }

    if (tags && tags.length > 0) {
      tickets = tickets.filter((t) => t.tags && t.tags.some((tag) => tags.includes(tag)))
    }

    // Generate report data based on requested metrics
    const report = {
      title: "Custom Modmail Report",
      timeRange:
        startDate && endDate
          ? `${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`
          : `Last ${timeRange} days`,
      filters: {
        staffId: staffId || "All Staff",
        category: category || "All Categories",
        tags: tags.length > 0 ? tags.join(", ") : "All Tags",
      },
      data: {},
    }

    // Ticket metrics
    if (metrics.includes("tickets")) {
      report.data.tickets = {
        total: tickets.length,
        closed: tickets.filter((t) => t.status === "closed").length,
        perDay: this.getTicketsPerDay(tickets, timeRange),
      }
    }

    // Response time metrics
    if (metrics.includes("response")) {
      const ticketsWithResponse = tickets.filter((t) => t.firstResponseTime)

      if (ticketsWithResponse.length > 0) {
        const responseTimes = ticketsWithResponse.map((t) => new Date(t.firstResponseTime) - new Date(t.createdAt))

        report.data.responseTimes = {
          average:
            (responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length / 60000).toFixed(2) + " minutes",
          min: (Math.min(...responseTimes) / 60000).toFixed(2) + " minutes",
          max: (Math.max(...responseTimes) / 60000).toFixed(2) + " minutes",
        }
      } else {
        report.data.responseTimes = {
          average: "N/A",
          min: "N/A",
          max: "N/A",
        }
      }
    }

    // Resolution time metrics
    if (metrics.includes("resolution")) {
      const closedTickets = tickets.filter((t) => t.status === "closed" && t.closedAt)

      if (closedTickets.length > 0) {
        const resolutionTimes = closedTickets.map((t) => new Date(t.closedAt) - new Date(t.createdAt))

        report.data.resolutionTimes = {
          average:
            (resolutionTimes.reduce((sum, time) => sum + time, 0) / resolutionTimes.length / 3600000).toFixed(2) +
            " hours",
          min: (Math.min(...resolutionTimes) / 3600000).toFixed(2) + " hours",
          max: (Math.max(...resolutionTimes) / 3600000).toFixed(2) + " hours",
        }
      } else {
        report.data.resolutionTimes = {
          average: "N/A",
          min: "N/A",
          max: "N/A",
        }
      }
    }

    // Satisfaction metrics
    if (metrics.includes("satisfaction")) {
      const ratedTickets = tickets.filter((t) => t.satisfactionRating)

      if (ratedTickets.length > 0) {
        const ratings = ratedTickets.map((t) => t.satisfactionRating)

        report.data.satisfaction = {
          average: (ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(2),
          counts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
          percentage: ((ratedTickets.length / tickets.length) * 100).toFixed(2) + "%",
        }

        // Count ratings
        ratedTickets.forEach((t) => {
          report.data.satisfaction.counts[t.satisfactionRating]++
        })
      } else {
        report.data.satisfaction = {
          average: "N/A",
          counts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
          percentage: "0%",
        }
      }
    }

    // Category and tag distribution
    report.data.categories = this.getCategoryCounts(tickets)
    report.data.tags = this.getTagCounts(tickets)

    return report
  }
}

module.exports = new TicketAnalytics()
