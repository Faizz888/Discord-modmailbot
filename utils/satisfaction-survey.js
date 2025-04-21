const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js")
const ticketHistory = require("./ticket-history")

class SatisfactionSurvey {
  constructor() {
    this.activeTickets = new Map()
  }

  async sendSurvey(client, ticket, user) {
    try {
      // Create the survey embed
      const surveyEmbed = new EmbedBuilder()
        .setColor(0x00bfff)
        .setTitle("⭐ Ticket Satisfaction Survey")
        .setDescription(
          `Thank you for using our modmail system! Your ticket (#${ticket.id}) has been closed.\n\nWe'd appreciate your feedback on how we handled your ticket. Please rate your experience from 1 to 5 stars.`,
        )
        .addFields(
          { name: "🎫 Ticket ID", value: ticket.id, inline: true },
          { name: "📅 Opened", value: new Date(ticket.createdAt).toLocaleString(), inline: true },
          { name: "🔒 Closed", value: new Date().toLocaleString(), inline: true },
        )
        .setFooter({ text: "Your feedback helps us improve our support" })
        .setTimestamp()

      // Create the rating buttons
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rating_1_${ticket.id}`).setLabel("1 ⭐").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`rating_2_${ticket.id}`).setLabel("2 ⭐").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`rating_3_${ticket.id}`).setLabel("3 ⭐").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`rating_4_${ticket.id}`).setLabel("4 ⭐").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`rating_5_${ticket.id}`).setLabel("5 ⭐").setStyle(ButtonStyle.Secondary),
      )

      // Send the survey
      const message = await user.send({
        embeds: [surveyEmbed],
        components: [row],
      })

      // Store the active survey
      this.activeTickets.set(ticket.id, {
        userId: user.id,
        messageId: message.id,
        ticketId: ticket.id,
        guildId: ticket.guildId,
        sentAt: new Date(),
        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      })

      return true
    } catch (error) {
      console.error("Error sending satisfaction survey:", error)
      return false
    }
  }

  async handleRating(interaction, client) {
    // Extract rating and ticket ID from the custom ID
    const [_, ratingStr, ticketId] = interaction.customId.split("_")
    const rating = Number.parseInt(ratingStr)

    // Check if this is a valid survey response
    if (!this.activeTickets.has(ticketId)) {
      return interaction.reply({
        content: "This survey is no longer active or has already been completed.",
        ephemeral: true,
      })
    }

    // Get the survey data
    const survey = this.activeTickets.get(ticketId)

    // Verify the user
    if (interaction.user.id !== survey.userId) {
      return interaction.reply({
        content: "This survey is not for you.",
        ephemeral: true,
      })
    }

    try {
      // Update the ticket in history with the rating
      ticketHistory.updateTicket(ticketId, {
        satisfactionRating: rating,
      })

      // Remove the buttons
      await interaction.update({
        components: [],
      })

      // Send thank you message instead of asking for feedback
      const thankYouEmbed = new EmbedBuilder()
        .setColor(0x00bfff)
        .setTitle("🙏 Thank You for Your Rating!")
        .setDescription(
          `You rated your experience ${rating} ⭐\n\nThank you for your feedback! It helps us improve our support.`,
        )
        .setFooter({ text: "Your feedback has been recorded" })
        .setTimestamp()

      await interaction.followUp({
        embeds: [thankYouEmbed],
      })

      // Send the rating to the staff channel
      try {
        // Get the ticket details
        const ticket = ticketHistory.getTicket(ticketId)
        if (ticket && ticket.guildId) {
          const guild = await client.guilds.fetch(ticket.guildId)
          const config = client.configs.get(ticket.guildId)

          if (guild && config && config.logChannelId) {
            const logChannel = await guild.channels.fetch(config.logChannelId)

            // Create rating notification embed
            const ratingEmbed = new EmbedBuilder()
              .setColor(this.getRatingColor(rating))
              .setTitle("⭐ New Ticket Rating Received")
              .setDescription(`A user has rated their ticket experience.`)
              .addFields([
                { name: "🎫 Ticket ID", value: ticket.numericId || ticketId, inline: true },
                { name: "⭐ Rating", value: `${rating} ⭐`, inline: true },
                { name: "👤 User", value: `<@${ticket.userId}>`, inline: true },
                {
                  name: "👨‍💼 Handled By",
                  value: ticket.assignedTo
                    ? ticket.assignedToDisplayName
                      ? `${ticket.assignedToDisplayName} (<@${ticket.assignedTo}>)`
                      : `<@${ticket.assignedTo}>`
                    : "Unassigned",
                  inline: true,
                },
                { name: "⏰ Closed At", value: new Date(ticket.closedAt).toLocaleString(), inline: true },
              ])
              .setTimestamp()

            await logChannel.send({ embeds: [ratingEmbed] })
          }
        }
      } catch (error) {
        console.error("Error sending rating notification:", error)
      }

      // Remove from active surveys
      this.activeTickets.delete(ticketId)

      return true
    } catch (error) {
      console.error("Error handling satisfaction rating:", error)
      await interaction.reply({
        content: "An error occurred while processing your rating. Please try again later.",
        ephemeral: true,
      })
      return false
    }
  }

  // Add a helper function to get color based on rating
  getRatingColor(rating) {
    switch (rating) {
      case 5:
        return 0x00ff00 // Green
      case 4:
        return 0x99ff00 // Light green
      case 3:
        return 0xffff00 // Yellow
      case 2:
        return 0xff9900 // Orange
      case 1:
        return 0xff0000 // Red
      default:
        return 0x0099ff // Blue
    }
  }
}

module.exports = new SatisfactionSurvey()
