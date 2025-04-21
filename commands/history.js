const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js")
const ticketHistory = require("../utils/ticket-history")

module.exports = {
  data: new SlashCommandBuilder()
    .setName("history")
    .setDescription("View ticket history for a user")
    .addUserOption((option) =>
      option.setName("user").setDescription("The user to check history for").setRequired(true),
    ),

  async execute(interaction, client) {
    // Check if the user has the staff role
    const config = client.configs.get(interaction.guild.id)
    if (!config) {
      return interaction.reply({
        content: "Modmail system is not set up in this server.",
        ephemeral: true,
      })
    }

    const member = await interaction.guild.members.fetch(interaction.user.id)
    if (!member.roles.cache.has(config.staffRoleId)) {
      return interaction.reply({
        content: "You do not have permission to view ticket history.",
        ephemeral: true,
      })
    }

    const user = interaction.options.getUser("user")

    try {
      // Get user's ticket history
      const tickets = ticketHistory.getUserTickets(user.id)

      if (tickets.length === 0) {
        return interaction.reply({
          content: `${user.tag} has no ticket history.`,
          ephemeral: true,
        })
      }

      // Sort tickets by date (newest first)
      tickets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

      // Create embed with ticket history
      const historyEmbed = {
        color: 0x0099ff,
        title: `Ticket History for ${user.tag}`,
        description: `${user.tag} has ${tickets.length} ticket(s) in the history.`,
        fields: tickets.slice(0, 10).map((ticket) => ({
          name: `Ticket #${ticket.id}`,
          value: `
            **Created:** ${new Date(ticket.createdAt).toLocaleString()}
            **Closed:** ${ticket.closedAt ? new Date(ticket.closedAt).toLocaleString() : "N/A"}
            **Category:** ${ticket.category || "None"}
            **Priority:** ${ticket.priority || "None"}
            **Status:** ${ticket.status}
            **Messages:** ${ticket.messageCount || "N/A"}
          `,
        })),
        footer: {
          text:
            tickets.length > 10 ? `Showing 10 of ${tickets.length} tickets` : `Showing all ${tickets.length} tickets`,
        },
        timestamp: new Date().toISOString(),
      }

      await interaction.reply({ embeds: [historyEmbed] })
    } catch (error) {
      console.error("Error fetching ticket history:", error)
      await interaction.reply({
        content: "An error occurred while fetching ticket history.",
        ephemeral: true,
      })
    }
  },
}
