const { SlashCommandBuilder } = require("discord.js")
const fs = require("fs")
const path = require("path")

module.exports = {
  data: new SlashCommandBuilder()
    .setName("snippet")
    .setDescription("Send a pre-defined response")
    .addStringOption((option) =>
      option.setName("name").setDescription("The name of the snippet").setRequired(true).setAutocomplete(true),
    ),

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
        content: "You do not have permission to use snippets.",
        ephemeral: true,
      })
    }

    // Find the ticket associated with this channel
    const ticket = Array.from(client.tickets.values()).find(
      (t) => t.guildId === interaction.guild.id && t.channelId === interaction.channel.id,
    )

    if (!ticket) {
      return interaction.reply({
        content: "This is not a modmail ticket channel.",
        ephemeral: true,
      })
    }

    const snippetName = interaction.options.getString("name")

    try {
      // Load snippets
      const snippetsPath = path.join(__dirname, "../snippets.json")
      let snippets = {}

      if (fs.existsSync(snippetsPath)) {
        const snippetsFile = fs.readFileSync(snippetsPath)
        snippets = JSON.parse(snippetsFile)
      }

      // Get the snippet for this guild
      const guildSnippets = snippets[interaction.guild.id] || {}
      const snippet = guildSnippets[snippetName]

      if (!snippet) {
        return interaction.reply({
          content: `Snippet "${snippetName}" not found.`,
          ephemeral: true,
        })
      }

      // Forward the snippet to the user
      const user = await client.users.fetch(ticket.userId)

      const staffEmbed = {
        color: 0x00ff00,
        author: {
          name: `${member.displayName || interaction.user.username} (Staff)`,
          icon_url: interaction.user.displayAvatarURL(),
        },
        description: snippet,
        footer: {
          text: `Snippet: ${snippetName}`,
        },
        timestamp: new Date().toISOString(),
      }

      await user.send({ embeds: [staffEmbed] })

      // Send confirmation in the channel
      await interaction.reply({
        content: `Sent snippet "${snippetName}" to the user.`,
      })

      // Also show the snippet in the channel
      const channelEmbed = {
        color: 0x00ff00,
        author: {
          name: `${member.displayName || interaction.user.username} (Staff)`,
          icon_url: interaction.user.displayAvatarURL(),
        },
        description: snippet,
        footer: {
          text: `Snippet: ${snippetName}`,
        },
        timestamp: new Date().toISOString(),
      }

      await interaction.channel.send({ embeds: [channelEmbed] })
    } catch (error) {
      console.error("Error sending snippet:", error)
      await interaction.reply({
        content: "An error occurred while sending the snippet.",
        ephemeral: true,
      })
    }
  },

  async autocomplete(interaction, client) {
    // Load snippets
    const snippetsPath = path.join(__dirname, "../snippets.json")
    let snippets = {}

    if (fs.existsSync(snippetsPath)) {
      const snippetsFile = fs.readFileSync(snippetsPath)
      snippets = JSON.parse(snippetsFile)
    }

    // Get the snippet names for this guild
    const guildSnippets = snippets[interaction.guild.id] || {}
    const snippetNames = Object.keys(guildSnippets)

    // Filter based on the focused value
    const focusedValue = interaction.options.getFocused()
    const filtered = snippetNames.filter((name) => name.startsWith(focusedValue))

    await interaction.respond(filtered.map((name) => ({ name, value: name })))
  },
}
