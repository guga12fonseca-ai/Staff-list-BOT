# Staff List

Bot Discord para criar painéis de cargos e membros com `/staff`.

## Recursos

- `/staff` como interface principal.
- Criar, editar, excluir e gerenciar vários painéis por servidor.
- Adicionar/remover cargos com seletor nativo do Discord.
- Ordem de cargos configurável.
- Membros em ordem alfabética por padrão.
- Contagem de membros por cargo.
- Atualização automática quando membros entram, saem ou ganham/perdem cargos.
- Menções azuis sem notificação (`allowedMentions` desativado).
- Cor real do cargo: cada cargo é renderizado em seu próprio embed.
- Paginação automática.
- Salvamento persistente em `data.json`.
- Recuperação automática da mensagem do painel quando ela for apagada.
- Limpeza automática de cargos que deixarem de existir.
- Alteração do nickname do bot no servidor.
- Permissões administrativas para configuração.

## Desenvolvimento local

1. Copie `.env.example` para `.env`.
2. Preencha `DISCORD_TOKEN`, `CLIENT_ID` e `GUILD_ID`.
3. Rode `npm install`.
4. Rode `npm run deploy`.
5. Rode `npm start`.

> Nunca publique o `.env` nem o token no GitHub.

## Railway

No Railway, adicione as mesmas três variáveis como variáveis de ambiente. O comando de inicialização é `npm start`.

O `data.json` é usado para persistência simples. Para um projeto de produção com alta disponibilidade, é recomendado trocar depois por um banco de dados.
