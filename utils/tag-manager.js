const fs = require("fs")
const path = require("path")

class TagManager {
  constructor() {
    this.tagsPath = path.join(__dirname, "../data/tags.json")
    this.ensureDirectoryExists()
    this.loadTags()
  }

  ensureDirectoryExists() {
    const dir = path.dirname(this.tagsPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  loadTags() {
    try {
      if (fs.existsSync(this.tagsPath)) {
        const data = fs.readFileSync(this.tagsPath, "utf8")
        this.tags = JSON.parse(data)
      } else {
        this.tags = {}
        this.saveTags()
      }
    } catch (error) {
      console.error("Error loading tags:", error)
      this.tags = {}
    }
  }

  saveTags() {
    try {
      fs.writeFileSync(this.tagsPath, JSON.stringify(this.tags, null, 2))
    } catch (error) {
      console.error("Error saving tags:", error)
    }
  }

  getGuildTags(guildId) {
    if (!this.tags[guildId]) {
      this.tags[guildId] = []
      this.saveTags()
    }
    return this.tags[guildId]
  }

  addTag(guildId, tag) {
    if (!this.tags[guildId]) {
      this.tags[guildId] = []
    }

    // Check if tag already exists
    const existingTag = this.tags[guildId].find((t) => t.name.toLowerCase() === tag.name.toLowerCase())

    if (existingTag) {
      return { success: false, message: "Tag already exists" }
    }

    // Add the tag
    this.tags[guildId].push(tag)
    this.saveTags()

    return { success: true, tag }
  }

  removeTag(guildId, tagName) {
    if (!this.tags[guildId]) {
      return { success: false, message: "No tags found for this guild" }
    }

    const initialLength = this.tags[guildId].length
    this.tags[guildId] = this.tags[guildId].filter((tag) => tag.name.toLowerCase() !== tagName.toLowerCase())

    if (this.tags[guildId].length === initialLength) {
      return { success: false, message: "Tag not found" }
    }

    this.saveTags()
    return { success: true }
  }

  updateTag(guildId, tagName, updates) {
    if (!this.tags[guildId]) {
      return { success: false, message: "No tags found for this guild" }
    }

    const tagIndex = this.tags[guildId].findIndex((tag) => tag.name.toLowerCase() === tagName.toLowerCase())

    if (tagIndex === -1) {
      return { success: false, message: "Tag not found" }
    }

    // Update the tag
    this.tags[guildId][tagIndex] = {
      ...this.tags[guildId][tagIndex],
      ...updates,
    }

    this.saveTags()
    return { success: true, tag: this.tags[guildId][tagIndex] }
  }

  getTag(guildId, tagName) {
    if (!this.tags[guildId]) {
      return null
    }

    return this.tags[guildId].find((tag) => tag.name.toLowerCase() === tagName.toLowerCase())
  }
}

module.exports = new TagManager()
