const { SlashCommandBuilder } = require("discord.js")
const { EmbedBuilder } = require("discord.js")

module.exports = {
  data: new SlashCommandBuilder()
    .setName("anonymous")
    .setDescription("Send an anonymous reply to the user")
    .addStringOption((option) => option.setName("message").setDescription("The message to send").setRequired(true)),

  async execute(interaction, client) {
    // Check if the command is used in a modmail channel
    const config = client.configs.get(interaction.guild.id)
    if (!config) {
      return interaction.reply({
        content: "Modmail system is not set up in this server.",
        ephemeral: true,
      })
    }

    // Check if the user has the staff role
    const member = await interaction.guild.members.fetch(interaction.user.id)
    if (!member.roles.cache.has(config.staffRoleId)) {
      return interaction.reply({
        content: "You do not have permission to send anonymous replies.",
        ephemeral: true,
      })
    }

    // Find the ticket associated with this channel
    let ticket = null
    let isThread = false

    if (
      config.useThreads &&
      interaction.channel.isThread() &&
      interaction.channel.parent?.id === config.modmailChannelId
    ) {
      // This is a thread in the modmail channel
      ticket = Array.from(client.tickets.values()).find(
        (t) => t.guildId === interaction.guild.id && t.threadId === interaction.channel.id && t.status !== "closed",
      )
      isThread = true
    } else if (interaction.channel.id === config.modmailChannelId) {
      // This is the modmail channel itself
      ticket = Array.from(client.tickets.values()).find(
        (t) => t.guildId === interaction.guild.id && t.channelId === interaction.channel.id && t.status !== "closed",
      )
    }

    if (!ticket) {
      return interaction.reply({
        content: "This is not a modmail ticket channel.",
        ephemeral: true,
      })
    }
    // Check if we're using thread mode but command was used in main channel
    if (config.useThreads && !isThread) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle("❌ Thread Required")
            .setDescription(
              "This server is configured to use threads for modmail tickets. Please use this command in the ticket's thread instead of the main channel.",
            )
            .addFields([
              {
                name: "Ticket Thread",
                value: ticket.threadId ? `<#${ticket.threadId}>` : "Thread not found",
              },
            ])
            .setTimestamp(),
        ],
        ephemeral: true,
      })
    }

    const message = interaction.options.getString("message")

    try {
      // Forward the message to the user
      const user = await client.users.fetch(ticket.userId)

      const anonymousEmbed = {
        color: 0x00ff00,
        author: {
          name: "Staff Team",
          icon_url: interaction.guild.iconURL(),
        },
        description: message,
        footer: {
          text: "Anonymous Reply",
        },
        timestamp: new Date().toISOString(),
      }

      await user.send({ embeds: [anonymousEmbed] })

      // Send confirmation in the channel
      await interaction.reply({
        content: "Anonymous reply sent.",
        ephemeral: true,
      })

      // Also show the message in the channel
      const channelEmbed = {
        color: 0x00ff00,
        author: {
          name: `${interaction.user.tag} (Anonymous)`,
          iconURL: interaction.user.displayAvatarURL(),
        },
        description: message,
        footer: {
          text: "Anonymous Reply",
        },
        timestamp: new Date().toISOString(),
      }

      await interaction.channel.send({ embeds: [channelEmbed] })

      // Log the anonymous reply
      const logChannel = await interaction.guild.channels.fetch(config.logChannelId)
      const logEmbed = {
        color: 0x00ff00,
        title: "Anonymous Reply Sent",
        description: `An anonymous reply was sent by ${interaction.user.tag} to ticket #${ticket.id}`,
        fields: [
          { name: "User", value: `<@${ticket.userId}>`, inline: true },
          { name: "Content", value: message.substring(0, 1024), inline: false },
        ],
        timestamp: new Date().toISOString(),
      }

      await logChannel.send({ embeds: [logEmbed] })
    } catch (error) {
      console.error("Error sending anonymous reply:", error)
      await interaction.reply({
        content: "An error occurred while sending the anonymous reply.",
        ephemeral: true,
      })
    }
  },
}
