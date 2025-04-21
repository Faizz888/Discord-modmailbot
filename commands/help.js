const { SlashCommandBuilder, EmbedBuilder } = require("discord.js")
const { PRIORITY_EMOJIS } = require("../utils/priority-utils")

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Get help with using the modmail system")
    .addStringOption((option) =>
      option
        .setName("command")
        .setDescription("Get information about a specific command")
        .setRequired(false)
        .addChoices(
          { name: "setup", value: "setup" },
          { name: "close", value: "close" },
          { name: "category", value: "category" },
          { name: "tag", value: "tag" },
          { name: "anonymous", value: "anonymous" },
          { name: "snippet", value: "snippet" },
          { name: "transcript", value: "transcript" },
          { name: "search", value: "search" },
          { name: "analytics", value: "analytics" },
          { name: "ratings", value: "ratings" },
          { name: "view-transcript", value: "view-transcript" },
        ),
    ),

  async execute(interaction, client) {
    const command = interaction.options.getString("command")

    if (command) {
      // Show help for a specific command
      const commandHelp = getCommandHelp(command)
      await interaction.reply({ embeds: [commandHelp] })
    } else {
      // Show general help
      const helpEmbed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🤖 Modmail Bot Help")
        .setDescription("This bot allows users to contact server staff through direct messages.")
        .addFields([
          {
            name: "📩 For Users",
            value:
              "• Send a direct message to the bot to create a ticket\n" +
              "• Continue sending messages to communicate with staff\n" +
              "• Your messages will be forwarded to the staff team\n" +
              "• Staff responses will be sent back to you through the bot",
          },
          {
            name: "🛠️ For Staff",
            value:
              "• `/close [reason]` - Close a ticket\n" +
              "• `/category <category>` - Set ticket category\n" +
              "• `/tag add <tag>` - Add a tag to a ticket\n" +
              "• `/anonymous <message>` - Send an anonymous reply\n" +
              "• `/snippet <name>` - Send a pre-defined response\n" +
              "• `/view-transcript <ticket-id>` - View and download a ticket transcript\n" +
              "• Start a message with `#` for staff-only notes",
          },
          {
            name: "⚙️ For Admins",
            value:
              "• `/setup` - Configure the modmail system\n" +
              "• `/webhook set <url>` - Set up webhook notifications\n" +
              "• `/blacklist add <user> <reason>` - Blacklist a user\n" +
              "• `/dashboard` - Access the admin dashboard\n" +
              "• `/ratings overview` - View all staff ratings",
          },
        ])
        .setFooter({ text: "Use /help <command> for more information about a specific command" })
        .setTimestamp()

      await interaction.reply({ embeds: [helpEmbed] })
    }
  },
}

function getCommandHelp(command) {
  const helpEmbeds = {
    setup: new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Command: /setup")
      .setDescription("Configure the modmail system for your server.")
      .addFields([
        {
          name: "Usage",
          value:
            "/setup modmail_channel:<channel> log_channel:<channel> staff_role:<role> [use_threads:true/false] [webhook_url:<url>]",
        },
        {
          name: "Options",
          value:
            "• `modmail_channel` - The channel where modmail tickets will be posted\n" +
            "• `log_channel` - The channel where modmail logs will be posted\n" +
            "• `staff_role` - The role that can handle modmail tickets\n" +
            "• `use_threads` - Whether to use threads for tickets (default: true)\n" +
            "• `webhook_url` - Webhook URL for external notifications (optional)",
        },
        { name: "Permission", value: "Administrator" },
      ]),

    close: new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Command: /close")
      .setDescription("Close a modmail ticket.")
      .addFields([
        { name: "Usage", value: "/close [reason:<text>]" },
        { name: "Options", value: "• `reason` - The reason for closing the ticket (optional)" },
        { name: "Permission", value: "Staff Role" },
        { name: "Note", value: "This command must be used in a ticket channel or thread." },
      ]),

    category: new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Command: /category")
      .setDescription("Set the category for a ticket.")
      .addFields([
        { name: "Usage", value: "/category category:<category> [priority:<priority>]" },
        {
          name: "Options",
          value:
            "• `category` - The category for this ticket (General Help, Technical Support, Report User, Appeal, Feedback)\n" +
            `• \`priority\` - The priority level of this ticket (${PRIORITY_EMOJIS.low} Low, ${PRIORITY_EMOJIS.medium} Medium, ${PRIORITY_EMOJIS.high} High, ${PRIORITY_EMOJIS.urgent} Urgent)`,
        },
        { name: "Permission", value: "Staff Role" },
        { name: "Note", value: "This command must be used in a ticket channel or thread." },
      ]),

    tag: new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Command: /tag")
      .setDescription("Add or remove tags from the current ticket.")
      .addFields([
        { name: "Usage", value: "/tag add tag:<tag>\n" + "/tag remove tag:<tag>\n" + "/tag list" },
        { name: "Options", value: "• `tag` - The tag to add or remove" },
        { name: "Permission", value: "Staff Role" },
        { name: "Note", value: "This command must be used in a ticket channel or thread." },
      ]),

    anonymous: new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Command: /anonymous")
      .setDescription("Send an anonymous reply to the user.")
      .addFields([
        { name: "Usage", value: "/anonymous message:<text>" },
        { name: "Options", value: "• `message` - The message to send" },
        { name: "Permission", value: "Staff Role" },
        { name: "Note", value: "This command must be used in a ticket channel or thread." },
      ]),

    snippet: new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Command: /snippet")
      .setDescription("Send a pre-defined response.")
      .addFields([
        { name: "Usage", value: "/snippet name:<name>" },
        { name: "Options", value: "• `name` - The name of the snippet" },
        { name: "Permission", value: "Staff Role" },
        { name: "Note", value: "This command must be used in a ticket channel or thread." },
      ]),

    transcript: new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Command: /transcript")
      .setDescription("Generate a transcript of the current ticket.")
      .addFields([
        { name: "Usage", value: "/transcript" },
        { name: "Permission", value: "Staff Role" },
        { name: "Note", value: "This command must be used in a ticket channel or thread." },
      ]),

    search: new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Command: /search")
      .setDescription("Search for tickets based on various criteria.")
      .addFields([
        {
          name: "Usage",
          value:
            "/search user user:<user>\n" +
            "/search ticket id:<id>\n" +
            "/search content query:<text>\n" +
            "/search tag tag:<tag>\n" +
            "/search category category:<category>\n" +
            "/search advanced [user:<user>] [content:<text>] [tag:<tag>] [category:<category>] [days:<number>]",
        },
        { name: "Permission", value: "Staff Role" },
      ]),

    analytics: new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Command: /analytics")
      .setDescription("View ticket analytics.")
      .addFields([
        { name: "Usage", value: "/analytics [days:<number>]" },
        { name: "Options", value: "• `days` - Number of days to analyze (default: 30)" },
        { name: "Permission", value: "Staff Role" },
      ]),

    ratings: new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Command: /ratings")
      .setDescription("View staff satisfaction ratings.")
      .addFields([
        {
          name: "Usage",
          value: "/ratings overview\n/ratings staff user:<user>\n/ratings recent [count:<number>]",
        },
        {
          name: "Options",
          value:
            "• `overview` - View ratings for all staff members\n• `staff` - View detailed ratings for a specific staff member\n• `recent` - View the most recent ratings\n• `count` - Number of recent ratings to show (default: 10)",
        },
        { name: "Permission", value: "Staff Role" },
      ]),

    "view-transcript": new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Command: /view-transcript")
      .setDescription("View and download a transcript of a ticket.")
      .addFields([
        { name: "Usage", value: "/view-transcript ticket_id:<id>" },
        { name: "Options", value: "• `ticket_id` - The ID of the ticket to view" },
        { name: "Permission", value: "Staff Role" },
        {
          name: "Note",
          value:
            "This command can be used in any channel. It will display a preview and provide a downloadable transcript.",
        },
      ]),
  }

  return (
    helpEmbeds[command] ||
    new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("Command Not Found")
      .setDescription(`No help available for command "${command}".`)
      .setFooter({ text: "Use /help for a list of commands" })
  )
}
