const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js")
const fs = require("fs")
const path = require("path")

module.exports = {
  data: new SlashCommandBuilder()
    .setName("add-snippet")
    .setDescription("Add a new snippet for quick responses")
    .addStringOption((option) => option.setName("name").setDescription("The name of the snippet").setRequired(true))
    .addStringOption((option) =>
      option.setName("content").setDescription("The content of the snippet").setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

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
        content: "You do not have permission to add snippets.",
        ephemeral: true,
      })
    }

    const snippetName = interaction.options.getString("name")
    const snippetContent = interaction.options.getString("content")

    try {
      // Load snippets
      const snippetsPath = path.join(__dirname, "../snippets.json")
      let snippets = {}

      if (fs.existsSync(snippetsPath)) {
        const snippetsFile = fs.readFileSync(snippetsPath)
        snippets = JSON.parse(snippetsFile)
      }

      // Add the snippet for this guild
      if (!snippets[interaction.guild.id]) {
        snippets[interaction.guild.id] = {}
      }

      snippets[interaction.guild.id][snippetName] = snippetContent

      // Save snippets
      fs.writeFileSync(snippetsPath, JSON.stringify(snippets, null, 2))

      await interaction.reply({
        content: `Snippet "${snippetName}" has been added.`,
        ephemeral: true,
      })

      // Log the snippet addition
      const logChannel = await interaction.guild.channels.fetch(config.logChannelId)
      const logEmbed = {
        color: 0x00ff00,
        title: "Snippet Added",
        description: `A new snippet has been added by ${interaction.user.tag}`,
        fields: [
          { name: "Name", value: snippetName, inline: true },
          { name: "Content", value: snippetContent.substring(0, 1024), inline: false },
        ],
        timestamp: new Date().toISOString(),
      }

      await logChannel.send({ embeds: [logEmbed] })
    } catch (error) {
      console.error("Error adding snippet:", error)
      await interaction.reply({
        content: "An error occurred while adding the snippet.",
        ephemeral: true,
      })
    }
  },
}
