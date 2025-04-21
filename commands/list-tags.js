const { SlashCommandBuilder, EmbedBuilder } = require("discord.js")
const tagManager = require("../utils/tag-manager")

module.exports = {
  data: new SlashCommandBuilder().setName("list-tags").setDescription("List all available tags"),

  async execute(interaction, client) {
    const guildTags = tagManager.getGuildTags(interaction.guild.id)

    if (guildTags.length === 0) {
      return interaction.reply({
        content: "There are no tags set up for this server yet.",
        ephemeral: true,
      })
    }

    // Sort tags alphabetically
    guildTags.sort((a, b) => a.name.localeCompare(b.name))

    const tagsEmbed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle("🏷️ Available Ticket Tags")
      .setDescription("Here are all the tags available for tickets:")
      .addFields(
        guildTags.map((tag) => ({
          name: tag.name,
          value: tag.description || "No description",
          inline: true,
        })),
      )
      .setFooter({ text: `Total tags: ${guildTags.length}` })
      .setTimestamp()

    await interaction.reply({
      embeds: [tagsEmbed],
    })
  },
}
