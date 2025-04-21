const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js")
const tagManager = require("../utils/tag-manager")

module.exports = {
  data: new SlashCommandBuilder()
    .setName("remove-tag")
    .setDescription("Remove an existing tag")
    .addStringOption((option) =>
      option.setName("name").setDescription("The name of the tag to remove").setRequired(true).setAutocomplete(true),
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
        content: "You do not have permission to remove tags.",
        ephemeral: true,
      })
    }

    const name = interaction.options.getString("name")

    const result = tagManager.removeTag(interaction.guild.id, name)

    if (!result.success) {
      return interaction.reply({
        content: `Failed to remove tag: ${result.message}`,
        ephemeral: true,
      })
    }

    await interaction.reply({
      content: `The tag "${name}" has been removed successfully.`,
      ephemeral: true,
    })

    // Log the tag removal
    const logChannel = await interaction.guild.channels.fetch(config.logChannelId)
    const logEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("Tag Removed")
      .setDescription(`A tag has been removed by ${member.displayName || interaction.user.username}`)
      .addFields([{ name: "Name", value: name, inline: true }])
      .setTimestamp()

    await logChannel.send({ embeds: [logEmbed] })
  },

  async autocomplete(interaction, client) {
    const focusedOption = interaction.options.getFocused(true)

    if (focusedOption.name === "name") {
      try {
        // Get all tags for this guild
        const guildTags = tagManager.getGuildTags(interaction.guild.id)

        // Filter based on input
        const filtered = guildTags
          .filter((tag) => tag.name.toLowerCase().includes(focusedOption.value.toLowerCase()))
          .map((tag) => ({ name: tag.name, value: tag.name }))
          .slice(0, 25)

        await interaction.respond(filtered)
      } catch (error) {
        console.error("Error in tag autocomplete:", error)
        await interaction.respond([])
      }
    }
  },
}
