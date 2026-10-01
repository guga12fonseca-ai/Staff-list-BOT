const fs = require("node:fs");
const path = require("node:path");
require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField
} = require("discord.js");

const DATA_FILE = path.join(__dirname, "data.json");
const MAX_EMBEDS_PER_MESSAGE = 10;
const EMBED_DESCRIPTION_LIMIT = 4096;
const ROLE_EMBED_FOOTER = "By: venny";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.GuildMember]
});

const EMPTY_DATA = { guilds: {} };
let data = loadData();

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) return structuredClone(EMPTY_DATA);
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return parsed && parsed.guilds ? parsed : structuredClone(EMPTY_DATA);
  } catch (error) {
    console.error("Falha ao ler data.json:", error);
    return structuredClone(EMPTY_DATA);
  }
}

function saveData() {
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function guildConfig(guildId) {
  if (!data.guilds[guildId]) {
    data.guilds[guildId] = { panels: {} };
  }
  return data.guilds[guildId];
}

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isAdmin(interaction) {
  return interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild) ||
         interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator);
}

function shortText(text, max = 80) {
  if (!text) return "Sem nome";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function panelLabel(panel) {
  return `📋 ${shortText(panel.title, 60)}`;
}

function memberCountForRole(guild, roleId) {
  return guild.members.cache.filter((member) => member.roles.cache.has(roleId)).size;
}

function normalizePanel(panel) {
  panel.roles = Array.isArray(panel.roles) ? panel.roles.filter(Boolean) : [];
  panel.page = Number.isInteger(panel.page) ? panel.page : 0;
  panel.title = panel.title || "Staff List";
  panel.description = panel.description || "";
  panel.memberOrder = panel.memberOrder || "name";
  panel.compact = Boolean(panel.compact);
  return panel;
}

function roleChunks(members) {
  const chunks = [];
  let current = [];

  for (const member of members) {
    const mention = `<@${member.id}>`;
    if (current.length && `${current.join("\n")}\n${mention}`.length > EMBED_DESCRIPTION_LIMIT) {
      chunks.push(current);
      current = [];
    }
    current.push(mention);
  }

  if (current.length) chunks.push(current);
  if (!chunks.length) chunks.push(["*Nenhum membro com este cargo.*"]);
  return chunks;
}

function sortedMembers(guild, roleId, order = "name") {
  const members = guild.members.cache.filter((m) => m.roles.cache.has(roleId));

  return [...members.values()].sort((a, b) => {
    if (order === "joined") {
      const at = a.joinedTimestamp ?? Number.MAX_SAFE_INTEGER;
      const bt = b.joinedTimestamp ?? Number.MAX_SAFE_INTEGER;
      return at - bt;
    }

    if (order === "id") return a.id.localeCompare(b.id);

    return a.displayName.localeCompare(b.displayName, "pt-BR", {
      sensitivity: "base",
      numeric: true
    });
  });
}

function buildRoleEmbeds(guild, role, panel) {
  const members = sortedMembers(guild, role.id, panel.memberOrder);
  const chunks = roleChunks(members);
  const roleColor = role.color || 0x5865F2;

  return chunks.map((chunk, index) => {
    const embed = new EmbedBuilder()
      .setColor(roleColor)
      .setTitle(`${role.name} (${members.length})`)
      .setDescription(chunk.join(panel.compact ? " " : "\n"))
      .setFooter({ text: ROLE_EMBED_FOOTER });

    if (chunks.length > 1) {
      embed.setAuthor({
        name: `Cargo ${index + 1}/${chunks.length}`
      });
    }

    return embed;
  });
}

async function fetchPanelMessages(guild, panel) {
  if (!panel.channelId) return [];
  const channel = await guild.channels.fetch(panel.channelId).catch(() => null);
  if (!channel?.isTextBased()) return [];

  const messages = [];
  for (const messageId of panel.messageIds || []) {
    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (message) messages.push(message);
  }
  return messages;
}

function navigationRow(panelId, page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`sl:page:${panelId}:prev`)
      .setLabel("Anterior")
      .setEmoji("◀️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`sl:page:${panelId}:info`)
      .setLabel(`Página ${page + 1}/${Math.max(totalPages, 1)}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`sl:page:${panelId}:next`)
      .setLabel("Próxima")
      .setEmoji("▶️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1)
  );
}

function configRows(panelId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sl:add:${panelId}`).setLabel("Adicionar cargo").setEmoji("➕").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`sl:remove:${panelId}`).setLabel("Remover cargo").setEmoji("➖").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`sl:edit:${panelId}`).setLabel("Editar painel").setEmoji("✏️").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`sl:order:${panelId}`).setLabel("Ordenar cargos").setEmoji("↕️").setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sl:preview:${panelId}`).setLabel("Ver prévia").setEmoji("👁️").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`sl:refresh:${panelId}`).setLabel("Atualizar").setEmoji("🔄").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`sl:settings:${panelId}`).setLabel("Configurações").setEmoji("⚙️").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`sl:delete:${panelId}`).setLabel("Excluir painel").setEmoji("🗑️").setStyle(ButtonStyle.Danger)
    )
  ];
}

function configEmbed(guild, panel) {
  const totalMembers = panel.roles.reduce((sum, roleId) => sum + memberCountForRole(guild, roleId), 0);

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle("🛠️ Staff List — Configuração")
    .setDescription(
      `**${shortText(panel.title, 100)}**\n\n` +
      `🛡️ Cargos monitorados: **${panel.roles.length}**\n` +
      `👥 Membros encontrados: **${totalMembers}**\n` +
      `🔄 Atualização automática: **Ativada**\n` +
      `📍 Canal: ${panel.channelId ? `<#${panel.channelId}>` : "Não configurado"}`
    )
    .setFooter({ text: ROLE_EMBED_FOOTER });
}

function createPanel(guild, title, channelId) {
  const id = createId();
  const panel = normalizePanel({
    id,
    title: title || "Staff List",
    description: "",
    channelId,
    messageIds: [],
    roles: [],
    page: 0,
    memberOrder: "name",
    compact: false
  });

  guildConfig(guild.id).panels[id] = panel;
  saveData();
  return panel;
}

async function buildPanelPages(guild, panel) {
  const roleEmbeds = [];

  for (const roleId of panel.roles) {
    const role = guild.roles.cache.get(roleId);
    if (!role || role.managed || role.id === guild.id) continue;
    roleEmbeds.push(...buildRoleEmbeds(guild, role, panel));
  }

  const header = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(panel.title)
    .setFooter({ text: ROLE_EMBED_FOOTER });

  if (panel.description) {
    header.setDescription(panel.description);
  } else {
    header.setDescription(" ");
  }

  // A header plus up to 9 role embeds keeps the panel title/description
  // visible while preserving each role's real Discord color.
  const pages = [];
  const firstPageRoles = roleEmbeds.splice(0, MAX_EMBEDS_PER_MESSAGE - 1);
  pages.push([header, ...firstPageRoles]);

  while (roleEmbeds.length) {
    pages.push(roleEmbeds.splice(0, MAX_EMBEDS_PER_MESSAGE));
  }

  return pages;
}

async function publishPanel(guild, panel, requestedPage = 0) {
  normalizePanel(panel);

  // Remove nonexistent roles from configuration.
  const before = panel.roles.length;
  panel.roles = panel.roles.filter((id) => guild.roles.cache.has(id));
  if (panel.roles.length !== before) saveData();

  const pages = await buildPanelPages(guild, panel);
  const page = Math.min(Math.max(requestedPage, 0), pages.length - 1);

  const channel = panel.channelId
    ? await guild.channels.fetch(panel.channelId).catch(() => null)
    : null;

  if (!channel?.isTextBased()) {
    throw new Error("O canal configurado não existe ou não é um canal de texto.");
  }

  const oldMessages = await fetchPanelMessages(guild, panel);
  const content = pages[page];
  const components = navigationRow(panel.id, page, pages.length);

  let message = oldMessages[0];
  if (!message) {
    message = await channel.send({
      embeds: content,
      components: [components],
      allowedMentions: { parse: [] }
    });
  } else {
    await message.edit({
      embeds: content,
      components: [components],
      allowedMentions: { parse: [] }
    });
  }

  // Keep only the current message for this page. Old page messages are deleted.
  for (const old of oldMessages.slice(1)) {
    await old.delete().catch(() => {});
  }

  panel.messageIds = [message.id];
  panel.page = page;
  saveData();

  return message;
}

async function refreshPanel(guild, panel) {
  return publishPanel(guild, panel, panel.page || 0);
}

async function sendOrRepairPanel(guild, panel) {
  try {
    return await publishPanel(guild, panel, panel.page || 0);
  } catch (error) {
    console.error(`Painel ${panel.id}:`, error.message);
    return null;
  }
}

function findPanel(guildId, panelId) {
  return data.guilds[guildId]?.panels?.[panelId] || null;
}

function panelsForGuild(guildId) {
  return Object.values(data.guilds[guildId]?.panels || {});
}

async function showPanelSelector(interaction) {
  const panels = panelsForGuild(interaction.guild.id);

  if (!panels.length) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle("📋 Staff List")
          .setDescription("Você ainda não configurou nenhum painel.")
          .setFooter({ text: ROLE_EMBED_FOOTER })
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("sl:create")
            .setLabel("Criar meu painel")
            .setEmoji("🚀")
            .setStyle(ButtonStyle.Success)
        )
      ],
      ephemeral: true
    });
  }

  const buttons = panels.slice(0, 5).map((panel) =>
    new ButtonBuilder()
      .setCustomId(`sl:open:${panel.id}`)
      .setLabel(shortText(panel.title, 70))
      .setStyle(ButtonStyle.Primary)
  );

  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle("📋 Staff List")
        .setDescription("Escolha o painel que deseja administrar.")
        .setFooter({ text: ROLE_EMBED_FOOTER })
    ],
    components: [new ActionRowBuilder().addComponents(buttons)],
    ephemeral: true
  });
}

async function openCreateModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId("sl:modal:create")
    .setTitle("Criar painel");

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("title")
        .setLabel("Título do painel")
        .setPlaceholder("Ex.: Staff Administrativo")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(256)
    )
  );

  await interaction.showModal(modal);
}

async function openEditModal(interaction, panelId) {
  const panel = findPanel(interaction.guild.id, panelId);
  if (!panel) return interaction.reply({ content: "Esse painel não existe mais.", ephemeral: true });

  const modal = new ModalBuilder()
    .setCustomId(`sl:modal:edit:${panelId}`)
    .setTitle("Editar painel");

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("title")
        .setLabel("Título")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(panel.title.slice(0, 256))
        .setMaxLength(256)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("description")
        .setLabel("Descrição (opcional)")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setValue(panel.description.slice(0, 1024))
        .setMaxLength(1024)
    )
  );

  await interaction.showModal(modal);
}

async function openSettings(interaction, panelId) {
  const panel = findPanel(interaction.guild.id, panelId);
  if (!panel) return interaction.reply({ content: "Esse painel não existe mais.", ephemeral: true });

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle("⚙️ Configurações")
    .setDescription(
      `**Ordem dos membros:** ${panel.memberOrder === "name" ? "Alfabética" : panel.memberOrder === "joined" ? "Entrada no servidor" : "ID"}\n` +
      `**Estilo:** ${panel.compact ? "Compacto" : "Espaçado"}\n` +
      `**Canal:** ${panel.channelId ? `<#${panel.channelId}>` : "Não configurado"}`
    )
    .setFooter({ text: ROLE_EMBED_FOOTER });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`sl:memberorder:${panelId}:name`).setLabel("A-Z").setStyle(panel.memberOrder === "name" ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`sl:memberorder:${panelId}:joined`).setLabel("Entrada").setStyle(panel.memberOrder === "joined" ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`sl:memberorder:${panelId}:id`).setLabel("ID").setStyle(panel.memberOrder === "id" ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`sl:compact:${panelId}`).setLabel(panel.compact ? "Espaçado" : "Compacto").setStyle(ButtonStyle.Secondary)
  );

  const channelRow = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(`sl:channel:${panelId}`)
      .setPlaceholder("Escolher canal do painel")
      .setChannelTypes(ChannelType.GuildText)
  );

  const nicknameRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`sl:nickname:${panelId}`).setLabel("Alterar nome do bot").setEmoji("🤖").setStyle(ButtonStyle.Primary)
  );

  await interaction.reply({
    embeds: [embed],
    components: [row, channelRow, nicknameRow],
    ephemeral: true
  });
}

async function addRole(interaction, panelId) {
  const menu = new RoleSelectMenuBuilder()
    .setCustomId(`sl:roleadd:${panelId}`)
    .setPlaceholder("Selecione o cargo para adicionar")
    .setMinValues(1)
    .setMaxValues(1);

  await interaction.reply({
    content: "Selecione um cargo:",
    components: [new ActionRowBuilder().addComponents(menu)],
    ephemeral: true
  });
}

async function removeRole(interaction, panelId) {
  const panel = findPanel(interaction.guild.id, panelId);
  if (!panel || !panel.roles.length) {
    return interaction.reply({ content: "Não há cargos neste painel.", ephemeral: true });
  }

  const menu = new RoleSelectMenuBuilder()
    .setCustomId(`sl:roleremove:${panelId}`)
    .setPlaceholder("Selecione o cargo para remover")
    .setMinValues(1)
    .setMaxValues(1);

  await interaction.reply({
    content: "Selecione o cargo que deseja remover:",
    components: [new ActionRowBuilder().addComponents(menu)],
    ephemeral: true
  });
}

function orderEmbed(guild, panel) {
  const lines = panel.roles.map((roleId, index) => {
    const role = guild.roles.cache.get(roleId);
    return `${index + 1}. ${role ? role.toString() : "Cargo removido"}`;
  });

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle("↕️ Ordenar cargos")
    .setDescription(lines.length ? lines.join("\n") : "Nenhum cargo configurado.")
    .setFooter({ text: "Use os botões para mover o cargo selecionado • By: venny" });
}

function orderRow(panel) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`sl:orderup:${panel.id}`).setLabel("Subir").setEmoji("⬆️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`sl:orderdown:${panel.id}`).setLabel("Descer").setEmoji("⬇️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`sl:orderselect:${panel.id}`).setLabel("Selecionar cargo").setEmoji("🎯").setStyle(ButtonStyle.Primary)
  );
}

async function showOrderSelector(interaction, panelId) {
  const panel = findPanel(interaction.guild.id, panelId);
  if (!panel || !panel.roles.length) return interaction.reply({ content: "Não há cargos para ordenar.", ephemeral: true });

  const menu = new RoleSelectMenuBuilder()
    .setCustomId(`sl:orderrole:${panelId}`)
    .setPlaceholder("Selecione o cargo que deseja mover")
    .setMinValues(1)
    .setMaxValues(1);

  await interaction.reply({
    content: "Selecione o cargo:",
    components: [new ActionRowBuilder().addComponents(menu)],
    ephemeral: true
  });
}

async function handleButton(interaction) {
  const [prefix, action, panelId, extra] = interaction.customId.split(":");
  if (prefix !== "sl") return;

  if (action === "create") return openCreateModal(interaction);

  if (action === "open") {
    const panel = findPanel(interaction.guild.id, panelId);
    if (!panel) return interaction.reply({ content: "Painel não encontrado.", ephemeral: true });
    return interaction.update({ embeds: [configEmbed(interaction.guild, panel)], components: configRows(panel.id) });
  }

  const panel = findPanel(interaction.guild.id, panelId);
  if (!panel) return interaction.reply({ content: "Esse painel não existe mais.", ephemeral: true });

  if (action === "edit") return openEditModal(interaction, panelId);
  if (action === "add") return addRole(interaction, panelId);
  if (action === "remove") return removeRole(interaction, panelId);
  if (action === "settings") return openSettings(interaction, panelId);

  if (action === "preview") {
    const pages = await buildPanelPages(interaction.guild, panel);
    return interaction.reply({
      embeds: pages[0],
      components: [navigationRow(panelId, 0, pages.length)],
      allowedMentions: { parse: [] },
      ephemeral: true
    });
  }

  if (action === "refresh") {
    await refreshPanel(interaction.guild, panel).catch(() => null);
    return interaction.reply({ content: "🔄 Painel atualizado.", ephemeral: true });
  }

  if (action === "delete") {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sl:deleteconfirm:${panelId}`).setLabel("Confirmar exclusão").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`sl:cancel:${panelId}`).setLabel("Cancelar").setStyle(ButtonStyle.Secondary)
    );
    return interaction.reply({
      content: "⚠️ Tem certeza que deseja excluir este painel?",
      components: [row],
      ephemeral: true
    });
  }

  if (action === "cancel") return interaction.update({ content: "Cancelado.", embeds: [], components: [] });

  if (action === "deleteconfirm") {
    delete guildConfig(interaction.guild.id).panels[panelId];
    saveData();
    return interaction.update({ content: "🗑️ Painel excluído.", embeds: [], components: [] });
  }

  if (action === "memberorder") {
    panel.memberOrder = extra || "name";
    saveData();
    await refreshPanel(interaction.guild, panel).catch(() => null);
    return interaction.update({ content: "Configuração atualizada.", embeds: [configEmbed(interaction.guild, panel)], components: configRows(panel.id) });
  }

  if (action === "compact") {
    panel.compact = !panel.compact;
    saveData();
    await refreshPanel(interaction.guild, panel).catch(() => null);
    return interaction.update({ content: "Configuração atualizada.", embeds: [configEmbed(interaction.guild, panel)], components: configRows(panel.id) });
  }

  if (action === "nickname") {
    const modal = new ModalBuilder().setCustomId(`sl:modal:nickname:${panelId}`).setTitle("Nome do bot no servidor");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("nickname")
          .setLabel("Novo nickname")
          .setPlaceholder("Staff List")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(32)
      )
    );
    return interaction.showModal(modal);
  }

  if (action === "order") {
    return interaction.reply({
      embeds: [orderEmbed(interaction.guild, panel)],
      components: [orderRow(panel)],
      ephemeral: true
    });
  }

  if (action === "orderselect") return showOrderSelector(interaction, panelId);

  if (action === "orderup" || action === "orderdown") {
    const selected = panel.selectedOrderRole;
    if (!selected) return interaction.reply({ content: "Primeiro selecione um cargo.", ephemeral: true });

    const index = panel.roles.indexOf(selected);
    if (index < 0) return interaction.reply({ content: "O cargo selecionado não está mais no painel.", ephemeral: true });

    const newIndex = action === "orderup" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= panel.roles.length) return interaction.reply({ content: "Esse cargo já está nessa extremidade.", ephemeral: true });

    [panel.roles[index], panel.roles[newIndex]] = [panel.roles[newIndex], panel.roles[index]];
    saveData();

    return interaction.update({
      embeds: [orderEmbed(interaction.guild, panel)],
      components: [orderRow(panel)]
    });
  }

  if (action === "page") {
    const direction = extra;
    const pages = await buildPanelPages(interaction.guild, panel);
    let page = panel.page || 0;
    if (direction === "prev") page--;
    if (direction === "next") page++;
    page = Math.min(Math.max(page, 0), pages.length - 1);

    panel.page = page;
    saveData();

    // This button is for the public panel message.
    return interaction.update({
      embeds: pages[page],
      components: [navigationRow(panelId, page, pages.length)],
      allowedMentions: { parse: [] }
    });
  }
}

async function handleModal(interaction) {
  const parts = interaction.customId.split(":");
  if (parts[0] !== "sl" || parts[1] !== "modal") return;

  if (parts[2] === "create") {
    const title = interaction.fields.getTextInputValue("title").trim();
    const panel = createPanel(interaction.guild, title, interaction.channelId);

    await interaction.reply({
      embeds: [configEmbed(interaction.guild, panel)],
      components: configRows(panel.id),
      ephemeral: true
    });

    await sendOrRepairPanel(interaction.guild, panel);
    return;
  }

  const panelId = parts[3];
  const panel = findPanel(interaction.guild.id, panelId);
  if (!panel) return interaction.reply({ content: "Painel não encontrado.", ephemeral: true });

  if (parts[2] === "edit") {
    panel.title = interaction.fields.getTextInputValue("title").trim() || "Staff List";
    panel.description = interaction.fields.getTextInputValue("description").trim();
    saveData();
    await refreshPanel(interaction.guild, panel).catch(() => null);
    return interaction.reply({
      content: "✏️ Painel atualizado.",
      embeds: [configEmbed(interaction.guild, panel)],
      components: configRows(panel.id),
      ephemeral: true
    });
  }

  if (parts[2] === "nickname") {
    const nickname = interaction.fields.getTextInputValue("nickname").trim();
    const me = interaction.guild.members.me;
    if (!me) return interaction.reply({ content: "Não consegui localizar meu membro no servidor.", ephemeral: true });

    try {
      await me.setNickname(nickname || null, "Staff List");
      return interaction.reply({ content: `🤖 Nickname atualizado para **${nickname || interaction.client.user.username}**.`, ephemeral: true });
    } catch (error) {
      return interaction.reply({
        content: "Não consegui alterar meu nickname. Verifique se o bot tem **Gerenciar apelidos** e se a hierarquia permite.",
        ephemeral: true
      });
    }
  }
}

async function handleSelect(interaction) {
  const [prefix, action, panelId] = interaction.customId.split(":");
  if (prefix !== "sl") return;

  const panel = findPanel(interaction.guild.id, panelId);
  if (!panel) return interaction.reply({ content: "Painel não encontrado.", ephemeral: true });

  if (action === "roleadd") {
    const roleId = interaction.values[0];
    const role = interaction.guild.roles.cache.get(roleId);

    if (!role || role.id === interaction.guild.id || role.managed) {
      return interaction.update({
        content: "❌ Esse cargo não pode ser monitorado pelo Staff List.",
        components: [],
        embeds: []
      });
    }

    if (!panel.roles.includes(roleId)) panel.roles.push(roleId);
    saveData();
    await refreshPanel(interaction.guild, panel).catch(() => null);
    return interaction.update({ content: "➕ Cargo adicionado e painel atualizado.", components: [], embeds: [] });
  }

  if (action === "roleremove") {
    const roleId = interaction.values[0];
    panel.roles = panel.roles.filter((id) => id !== roleId);
    saveData();
    await refreshPanel(interaction.guild, panel).catch(() => null);
    return interaction.update({ content: "➖ Cargo removido e painel atualizado.", components: [], embeds: [] });
  }

  if (action === "channel") {
    panel.channelId = interaction.values[0];
    panel.messageIds = [];
    saveData();
    await refreshPanel(interaction.guild, panel).catch(() => null);
    return interaction.update({ content: "📍 Canal atualizado e painel publicado.", components: [], embeds: [] });
  }

  if (action === "orderrole") {
    panel.selectedOrderRole = interaction.values[0];
    saveData();
    return interaction.update({
      content: `🎯 Cargo selecionado: <@&${panel.selectedOrderRole}>`,
      embeds: [orderEmbed(interaction.guild, panel)],
      components: [orderRow(panel)]
    });
  }
}

async function handleInteraction(interaction) {
  if (!isAdmin(interaction)) {
    return interaction.reply({ content: "Você precisa de **Gerenciar Servidor** ou **Administrador** para usar o Staff List.", ephemeral: true });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === "staff") {
    return showPanelSelector(interaction);
  }

  if (interaction.isButton()) return handleButton(interaction);
  if (interaction.isModalSubmit()) return handleModal(interaction);
  if (interaction.isRoleSelectMenu() || interaction.isChannelSelectMenu()) return handleSelect(interaction);
}

client.on("interactionCreate", (interaction) => {
  handleInteraction(interaction).catch((error) => {
    console.error("Erro em interactionCreate:", error);
    const response = { content: "Ocorreu um erro ao processar essa ação.", ephemeral: true };
    if (interaction.replied || interaction.deferred) interaction.followUp(response).catch(() => {});
    else interaction.reply(response).catch(() => {});
  });
});

let refreshTimer;
const refreshAffectedPanels = async (guild) => {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    for (const panel of panelsForGuild(guild.id)) {
      await refreshPanel(guild, panel).catch(() => {});
    }
  }, 500);
};

client.on("guildMemberUpdate", async (oldMember, newMember) => {
  if (!newMember.guild) return;

  const oldIds = new Set(oldMember.roles.cache.keys());
  const newIds = new Set(newMember.roles.cache.keys());
  const changedRoleIds = new Set();

  for (const id of oldIds) if (!newIds.has(id)) changedRoleIds.add(id);
  for (const id of newIds) if (!oldIds.has(id)) changedRoleIds.add(id);

  if (!changedRoleIds.size) return;

  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    for (const panel of panelsForGuild(newMember.guild.id)) {
      if (panel.roles.some((roleId) => changedRoleIds.has(roleId))) {
        await refreshPanel(newMember.guild, panel).catch(() => {});
      }
    }
  }, 500);
});

client.on("guildMemberAdd", async (member) => refreshAffectedPanels(member.guild));
client.on("guildMemberRemove", async (member) => refreshAffectedPanels(member.guild));

client.on("messageDelete", async (message) => {
  if (!message.guildId) return;
  const cfg = data.guilds[message.guildId];
  if (!cfg) return;

  for (const panel of Object.values(cfg.panels)) {
    if ((panel.messageIds || []).includes(message.id)) {
      panel.messageIds = [];
      saveData();
      const guild = client.guilds.cache.get(message.guildId);
      if (guild) await sendOrRepairPanel(guild, panel);
    }
  }
});

client.on("roleDelete", async (role) => {
  const cfg = guildConfig(role.guild.id);
  let changed = false;
  for (const panel of Object.values(cfg.panels)) {
    if (panel.roles.includes(role.id)) {
      panel.roles = panel.roles.filter((id) => id !== role.id);
      changed = true;
    }
  }
  if (changed) {
    saveData();
    await refreshAffectedPanels(role.guild);
  }
});

client.on("channelDelete", (channel) => {
  const cfg = guildConfig(channel.guild.id);
  let changed = false;
  for (const panel of Object.values(cfg.panels)) {
    if (panel.channelId === channel.id) {
      panel.channelId = null;
      panel.messageIds = [];
      changed = true;
    }
  }
  if (changed) saveData();
});

client.once("ready", async () => {
  console.log(`Staff List conectado como ${client.user.tag}`);
  for (const guild of client.guilds.cache.values()) {
    for (const panel of panelsForGuild(guild.id)) {
      await sendOrRepairPanel(guild, panel);
    }
  }
});

if (!process.env.DISCORD_TOKEN) {
  console.error("DISCORD_TOKEN não foi definido.");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
