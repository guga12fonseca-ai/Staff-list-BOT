const {
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits
} = require("discord.js");

require("dotenv").config?.();

const command = new SlashCommandBuilder()
  .setName("staff")
  .setDescription("Abrir o painel de gerenciamento do Staff List")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString());

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

async function main() {
  const clientId = process.env.CLIENT_ID;

  if (!process.env.DISCORD_TOKEN || !clientId) {
    throw new Error("Preencha DISCORD_TOKEN e CLIENT_ID.");
  }
  
  await rest.put(
    Routes.applicationCommands(clientId),
    { body: [command.toJSON()] }
  );

  console.log("Comando /staff registrado no servidor de teste.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
