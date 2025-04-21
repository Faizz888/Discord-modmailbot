const { SlashCommandBuilder, EmbedBuilder } = require("discord.js")

module.exports = {
  data: new SlashCommandBuilder()
    .setName("aboutme")
    .setDescription("Get information about the bot and available commands"),

  async execute(interaction, client) {
    const aboutEmbed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🤖 Advanced Discord Modmail Bot")
      .setDescription(
        "I'm a professional modmail bot designed to facilitate communication between server members and staff. " +
          "I provide a seamless ticket system with advanced features for tracking, analytics, and management.",
      )
      .addFields(
        {
          name: "📋 Core Features",
          value:
            "• 📩 **Ticket System**: Users can DM the bot to create support tickets\n" +
            "• 🧵 **Thread Management**: Each ticket creates a thread in a designated modmail channel\n" +
            "• 💬 **Staff Responses**: Staff can reply to threads to communicate with users\n" +
            "• 🔒 **Ticket Closure**: Staff can close tickets when issues are resolved\n" +
            "• 📝 **Logging**: All conversations are logged for future reference",
        },
        {
          name: "⭐ Advanced Features",
          value:
            "• 👤 **User Information**: Displays user information when a ticket is created\n" +
            "• 📊 **Ticket Categories**: Categorize tickets by type\n" +
            "• 🏷️ **Ticket Tagging**: Add tags to tickets for better organization\n" +
            "• 😊 **User Satisfaction**: Collect feedback from users after ticket closure\n" +
            "• 📈 **Analytics**: Track response times, resolution rates, and staff performance\n" +
            "• 🔍 **Ticket Search**: Find tickets based on various criteria\n" +
            "• 🧵 **Thread-Based Tickets**: Use Discord threads for better organization of tickets\n" +
            "• 🔔 **Webhook Notifications**: Send notifications to external services\n" +
            "• 👁️ **Staff Message Filtering**: Messages starting with # are only visible to staff\n" +
            "• 🎛️ **Admin Dashboard**: Interactive dashboard with reaction-based navigation",
        },
        {
          name: "⚙️ Setup Commands",
          value:
            "• `/setup` - Configure the modmail system\n" +
            "• `/webhook set <url>` - Set up webhook notifications\n" +
            "• `/webhook remove` - Remove webhook notifications\n" +
            "• `/webhook test` - Test webhook notifications",
        },
        {
          name: "🎫 Ticket Management Commands",
          value:
            "• `/close [reason]` - Close a ticket with an optional reason\n" +
            "• `/tag add <tag>` - Add a tag to the current ticket\n" +
            "• `/tag remove <tag>` - Remove a tag from the current ticket\n" +
            "• `/tag list` - List all tags on the current ticket\n" +
            "• `/category <category> [priority]` - Set the category and priority for a ticket\n" +
            "• `/priority <level>` - Set the priority level for a ticket\n" +
            "• `/dashboard` - Access the interactive admin dashboard",
        },
        {
          name: "📊 Analytics Commands",
          value:
            "• `/analytics [days]` - View ticket analytics for a specified time period\n" +
            "• `/history <user>` - View ticket history for a specific user\n" +
            "• `/search` - Search for tickets based on various criteria\n" +
            "• `/performance overview [days]` - View performance overview for all staff\n" +
            "• `/performance staff <user> [days]` - View detailed performance for a specific staff member\n" +
            "• `/report summary <period>` - Generate a summary report\n" +
            "• `/report custom` - Generate a custom report with specific metrics\n" +
            "• `/ratings overview` - View ratings for all staff members\n" +
            "• `/ratings staff <user>` - View detailed ratings for a specific staff member\n" +
            "• `/view-transcript <ticket-id>` - View and download a ticket transcript",
        },
      )
      .setFooter({ text: "For more information on a specific command, use /help <command>" })
      .setTimestamp()

    await interaction.reply({
      embeds: [aboutEmbed],
    })
  },
}
