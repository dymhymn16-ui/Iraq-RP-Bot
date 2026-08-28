const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  REST,
  Routes
} = require("discord.js");

const { getData, saveData } = require("./database");
const config = require("./config");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// =========================
// أدوات
// =========================

function dbInit(db) {
  db.users ??= {};
  db.gangs ??= {};
  db.jail ??= {};
  db.invites ??= {};
  db.reports ??= {};
  db.wars ??= {};
  db.missions ??= {};
  return db;
}

function user(db, id) {
  db.users[id] ??= {
    balance: 0,
    wanted: false,
    wantedReason: null
  };
  return db.users[id];
}

function role(member, id) {
  return member.roles.cache.has(id);
}

function owner(member) {
  return role(member, config.roles.owner);
}

function police(member) {
  return (
    role(member, config.roles.policeLeader) ||
    role(member, config.roles.policeDeputy) ||
    role(member, config.roles.policeOfficer)
  );
}

function policeLeader(member) {
  return owner(member) || role(member, config.roles.policeLeader);
}

function policeDeputy(member) {
  return policeLeader(member) || role(member, config.roles.policeDeputy);
}

function gangOf(db, id) {
  for (const [gid, gang] of Object.entries(db.gangs)) {
    if (gang.members?.includes(id)) {
      return { id: gid, gang };
    }
  }
  return null;
}

function gangLeader(db, id) {
  const g = gangOf(db, id);
  return g && g.gang.leader === id;
}

function gangManagement(db, id) {
  const g = gangOf(db, id);
  return g && (g.gang.leader === id || g.gang.deputy === id);
}

function money(n) {
  return Number(n || 0).toLocaleString();
}

async function giveRole(member, id) {
  if (!member.roles.cache.has(id)) {
    await member.roles.add(id);
  }
}

async function takeRole(member, id) {
  if (member.roles.cache.has(id)) {
    await member.roles.remove(id);
  }
}

// =========================
// الأوامر
// =========================

const commands = [

  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("عرض رصيدك"),

  new SlashCommandBuilder()
    .setName("addmoney")
    .setDescription("إضافة أموال")
    .addUserOption(o =>
      o.setName("user").setDescription("العضو").setRequired(true))
    .addIntegerOption(o =>
      o.setName("amount").setDescription("المبلغ").setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName("removemoney")
    .setDescription("سحب أموال")
    .addUserOption(o =>
      o.setName("user").setDescription("العضو").setRequired(true))
    .addIntegerOption(o =>
      o.setName("amount").setDescription("المبلغ").setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName("creategang")
    .setDescription("إنشاء عصابة")
    .addStringOption(o =>
      o.setName("name").setDescription("اسم العصابة").setRequired(true)),

  new SlashCommandBuilder()
    .setName("ganginfo")
    .setDescription("معلومات العصابة"),

  new SlashCommandBuilder()
    .setName("ganginvite")
    .setDescription("دعوة عضو للعصابة")
    .addUserOption(o =>
      o.setName("user").setDescription("العضو").setRequired(true)),

  new SlashCommandBuilder()
    .setName("gangkick")
    .setDescription("طرد عضو من العصابة")
    .addUserOption(o =>
      o.setName("user").setDescription("العضو").setRequired(true)),

  new SlashCommandBuilder()
    .setName("leavegang")
    .setDescription("مغادرة العصابة"),

  new SlashCommandBuilder()
    .setName("gangbank")
    .setDescription("بنك العصابة"),

  new SlashCommandBuilder()
    .setName("gangstorage")
    .setDescription("مخزن العصابة"),

  new SlashCommandBuilder()
    .setName("policeinfo")
    .setDescription("معلومات الشرطة"),

  new SlashCommandBuilder()
    .setName("policeinvite")
    .setDescription("دعوة عضو للشرطة")
    .addUserOption(o =>
      o.setName("user").setDescription("العضو").setRequired(true)),

  new SlashCommandBuilder()
    .setName("policekick")
    .setDescription("طرد عضو من الشرطة")
    .addUserOption(o =>
      o.setName("user").setDescription("العضو").setRequired(true)),

  new SlashCommandBuilder()
    .setName("policemissions")
    .setDescription("مهام الشرطة"),

  new SlashCommandBuilder()
    .setName("jail")
    .setDescription("سجن عضو")
    .addUserOption(o =>
      o.setName("user").setDescription("العضو").setRequired(true))
    .addIntegerOption(o =>
      o.setName("minutes").setDescription("الدقائق").setRequired(true).setMinValue(1).setMaxValue(1440)),

  new SlashCommandBuilder()
    .setName("unjail")
    .setDescription("فك السجن")
    .addUserOption(o =>
      o.setName("user").setDescription("العضو").setRequired(true)),

  new SlashCommandBuilder()
    .setName("wanted")
    .setDescription("جعل عضو مطلوب")
    .addUserOption(o =>
      o.setName("user").setDescription("العضو").setRequired(true))
    .addStringOption(o =>
      o.setName("reason").setDescription("السبب").setRequired(true)),

  new SlashCommandBuilder()
    .setName("unwanted")
    .setDescription("إزالة المطلوبية")
    .addUserOption(o =>
      o.setName("user").setDescription("العضو").setRequired(true)),

  new SlashCommandBuilder()
    .setName("arrest")
    .setDescription("القبض على مطلوب")
    .addUserOption(o =>
      o.setName("user").setDescription("المطلوب").setRequired(true)),

  new SlashCommandBuilder()
    .setName("report")
    .setDescription("تقديم بلاغ")
    .addStringOption(o =>
      o.setName("text").setDescription("البلاغ").setRequired(true)),

  new SlashCommandBuilder()
    .setName("rob")
    .setDescription("تنفيذ عملية سرقة"),

  new SlashCommandBuilder()
    .setName("war")
    .setDescription("بدء حرب"),

  new SlashCommandBuilder()
    .setName("mission")
    .setDescription("عرض مهمتك")

].map(x => x.toJSON());

// =========================
// تشغيل
// =========================

client.once("ready", async () => {
  console.log(`✅ البوت اشتغل: ${client.user.tag}`);

  try {
    const rest = new REST({ version: "10" })
      .setToken(process.env.TOKEN);

    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );

    console.log("✅ تم تسجيل الأوامر");
  } catch (e) {
    console.error("❌ خطأ تسجيل الأوامر:", e);
  }
});

// =========================
// الأوامر
// =========================

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    const db = dbInit(getData());
    const id = interaction.user.id;
    const member = interaction.member;
    user(db, id);

    // BALANCE
    if (interaction.commandName === "balance") {
      return interaction.reply({
        content: `💰 رصيدك: **$${money(user(db, id).balance)}**`,
        ephemeral: true
      });
    }

    // ADD MONEY
    if (interaction.commandName === "addmoney") {
      if (!owner(member))
        return interaction.reply({ content: "❌ للمالك فقط.", ephemeral: true });

      const target = interaction.options.getUser("user");
      const amount = interaction.options.getInteger("amount");

      user(db, target.id).balance += amount;
      saveData(db);

      return interaction.reply(`✅ تمت إضافة **$${money(amount)}** إلى ${target}.`);
    }

    // REMOVE MONEY
    if (interaction.commandName === "removemoney") {
      if (!owner(member))
        return interaction.reply({ content: "❌ للمالك فقط.", ephemeral: true });

      const target = interaction.options.getUser("user");
      const amount = interaction.options.getInteger("amount");

      user(db, target.id).balance =
        Math.max(0, user(db, target.id).balance - amount);

      saveData(db);

      return interaction.reply(`✅ تم سحب **$${money(amount)}** من ${target}.`);
    }

    // CREATE GANG
    if (interaction.commandName === "creategang") {
      if (!owner(member))
        return interaction.reply({ content: "❌ الإدارة فقط.", ephemeral: true });

      if (gangOf(db, id))
        return interaction.reply({ content: "❌ أنت داخل عصابة.", ephemeral: true });

      const name = interaction.options.getString("name");
      const gid = `gang_${Date.now()}`;

      db.gangs[gid] = {
        name,
        leader: id,
        deputy: null,
        members: [id],
        bank: 0,
        storage: { weed: 0, stolen: 0, weapons: 0 },
        wins: 0,
        losses: 0
      };

      await giveRole(member, config.roles.gangLeader);
      saveData(db);

      return interaction.reply(`🔫 تم إنشاء عصابة **${name}**.\n👑 الزعيم: ${interaction.user}`);
    }

    // GANG INFO
    if (interaction.commandName === "ganginfo") {
      const result = gangOf(db, id);

      if (!result)
        return interaction.reply({ content: "❌ أنت لست بعصابة.", ephemeral: true });

      const g = result.gang;

      const embed = new EmbedBuilder()
        .setTitle(`🔫 معلومات عصابة ${g.name}`)
        .addFields(
          { name: "👑 الزعيم", value: `<@${g.leader}>`, inline: true },
          { name: "🥷 النائب", value: g.deputy ? `<@${g.deputy}>` : "لا يوجد", inline: true },
          { name: "👥 الأعضاء", value: `${g.members.length}`, inline: true },
          { name: "💰 البنك", value: `$${money(g.bank)}`, inline: true },
          { name: "🌿 الحشيش", value: `${g.storage.weed} كغ`, inline: true },
          { name: "📦 المسروقات", value: `${g.storage.stolen}`, inline: true },
          { name: "🔫 الأسلحة", value: `${g.storage.weapons}`, inline: true },
          { name: "🏆 الانتصارات", value: `${g.wins}`, inline: true },
          { name: "💀 الخسائر", value: `${g.losses}`, inline: true },
          { name: "👥 قائمة الأعضاء", value: g.members.map(x => `<@${x}>`).join("\n") || "لا يوجد" }
        )
        .setColor(0x8b0000);

      return interaction.reply({ embeds: [embed] });
    }

    // GANG INVITE
    if (interaction.commandName === "ganginvite") {
      if (!gangManagement(db, id))
        return interaction.reply({ content: "❌ الزعيم ونائبه فقط.", ephemeral: true });

      const target = interaction.options.getUser("user");

      if (gangOf(db, target.id))
        return interaction.reply({ content: "❌ العضو داخل عصابة.", ephemeral: true });

      const gid = gangOf(db, id).id;
      const invite = `gang_${Date.now()}`;

      db.invites[invite] = {
        type: "gang",
        gangId: gid,
        to: target.id
      };

      saveData(db);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`ga_${invite}`)
          .setLabel("✅ قبول")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`gr_${invite}`)
          .setLabel("❌ رفض")
          .setStyle(ButtonStyle.Danger)
      );

      const embed = new EmbedBuilder()
        .setTitle("📨 دعوة عصابة")
        .setDescription(
          `🔫 العصابة: **${db.gangs[gid].name}**\n` +
          `👤 المدعو: ${target}\n` +
          `👑 الداعي: ${interaction.user}\n\n` +
          `اضغط قبول للانضمام.`
        );

      await target.send({ embeds: [embed], components: [row] }).catch(() => {});

      return interaction.reply({
        content: `✅ تم إرسال الدعوة إلى ${target}.`,
        ephemeral: true
      });
    }

    // GANG KICK
    if (interaction.commandName === "gangkick") {
      if (!gangManagement(db, id))
        return interaction.reply({ content: "❌ الزعيم ونائبه فقط.", ephemeral: true });

      const result = gangOf(db, id);
      const target = interaction.options.getMember("user");

      if (!target || !result.gang.members.includes(target.id))
        return interaction.reply({ content: "❌ العضو ليس في عصابتك.", ephemeral: true });

      if (target.id === result.gang.leader)
        return interaction.reply({ content: "❌ لا يمكن طرد زعيم العصابة.", ephemeral: true });

      result.gang.members =
        result.gang.members.filter(x => x !== target.id);

      if (result.gang.deputy === target.id)
        result.gang.deputy = null;

      await takeRole(target, config.roles.gangMember);
      await takeRole(target, config.roles.gangDeputy);

      saveData(db);

      return interaction.reply(`✅ تم طرد ${target} من العصابة.`);
    }

    // LEAVE
    if (interaction.commandName === "leavegang") {
      const result = gangOf(db, id);

      if (!result)
        return interaction.reply({ content: "❌ أنت لست بعصابة.", ephemeral: true });

      if (result.gang.leader === id)
        return interaction.reply({ content: "❌ الزعيم لا يستطيع المغادرة.", ephemeral: true });

      result.gang.members =
        result.gang.members.filter(x => x !== id);

      if (result.gang.deputy === id)
        result.gang.deputy = null;

      await takeRole(member, config.roles.gangMember);
      await takeRole(member, config.roles.gangDeputy);

      saveData(db);

      return interaction.reply("✅ غادرت العصابة.");
    }

    // GANG BANK
    if (interaction.commandName === "gangbank") {
      const result = gangOf(db, id);

      if (!result)
        return interaction.reply({ content: "❌ أنت لست بعصابة.", ephemeral: true });

      return interaction.reply({
        content: `💰 بنك **${result.gang.name}**: **$${money(result.gang.bank)}**`,
        ephemeral: true
      });
    }

    // STORAGE
    if (interaction.commandName === "gangstorage") {
      const result = gangOf(db, id);

      if (!result)
        return interaction.reply({ content: "❌ أنت لست بعصابة.", ephemeral: true });

      const s = result.gang.storage;

      return interaction.reply({
        content:
          `📦 مخزن **${result.gang.name}**\n\n` +
          `🌿 الحشيش: **${s.weed} كغ**\n` +
          `📦 المسروقات: **${s.stolen}**\n` +
          `🔫 الأسلحة: **${s.weapons}**`,
        ephemeral: true
      });
    }

    // POLICE INFO
    if (interaction.commandName === "policeinfo") {
      if (!police(member) && !owner(member))
        return interaction.reply({ content: "❌ للشرطة فقط.", ephemeral: true });

      const members = await interaction.guild.members.fetch();

      const leader = members.find(x =>
        role(x, config.roles.policeLeader)
      );

      const deputies = members.filter(x =>
        role(x, config.roles.policeDeputy)
      );

      const officers = members.filter(x =>
        role(x, config.roles.policeOfficer)
      );

      const embed = new EmbedBuilder()
        .setTitle("🚔 معلومات الشرطة")
        .addFields(
          {
            name: "👑 قائد الشرطة",
            value: leader ? `<@${leader.id}>` : "لا يوجد"
          },
          {
            name: "🥷 نواب الشرطة",
            value: deputies.map(x => `<@${x.id}>`).join("\n") || "لا يوجد"
          },
          {
            name: "👮 أعضاء الشرطة",
            value: officers.map(x => `<@${x.id}>`).join("\n") || "لا يوجد"
          }
        )
        .setColor(0x0066ff);

      return interaction.reply({ embeds: [embed] });
    }

    // POLICE INVITE
    if (interaction.commandName === "policeinvite") {
      if (!policeDeputy(member))
        return interaction.reply({ content: "❌ قائد الشرطة ونائبه فقط.", ephemeral: true });

      const target = interaction.options.getUser("user");
      const targetMember = await interaction.guild.members.fetch(target.id);

      if (police(targetMember))
        return interaction.reply({ content: "❌ العضو موجود بالشرطة.", ephemeral: true });

      const invite = `police_${Date.now()}`;

      db.invites[invite] = {
        type: "police",
        to: target.id
      };

      saveData(db);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`pa_${invite}`)
          .setLabel("✅ قبول")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`pr_${invite}`)
          .setLabel("❌ رفض")
          .setStyle(ButtonStyle.Danger)
      );

      const embed = new EmbedBuilder()
        .setTitle("📨 دعوة للشرطة")
        .setDescription(
          `🚔 الجهة: **الشرطة**\n` +
          `👤 المدعو: ${target}\n` +
          `👮 الداعي: ${interaction.user}\n\n` +
          `هل تريد الانضمام؟`
        );

      await target.send({ embeds: [embed], components: [row] }).catch(() => {});

      return interaction.reply({
        content: `✅ تم إرسال الدعوة إلى ${target}.`,
        ephemeral: true
      });
    }

    // POLICE KICK
    if (interaction.commandName === "policekick") {
      if (!policeLeader(member))
        return interaction.reply({ content: "❌ قائد الشرطة فقط.", ephemeral: true });

      const target = interaction.options.getMember("user");

      if (!target || !role(target, config.roles.policeOfficer))
        return interaction.reply({ content: "❌ هذا العضو ليس شرطيًا.", ephemeral: true });

      await takeRole(target, config.roles.policeOfficer);

      saveData(db);

      return interaction.reply(`✅ تم طرد ${target} من الشرطة.`);
    }

    // POLICE MISSIONS
    if (interaction.commandName === "policemissions") {
      if (!police(member))
        return interaction.reply({ content: "❌ للشرطة فقط.", ephemeral: true });

      return interaction.reply({
        content:
          "🏆 **مهام الشرطة**\n\n" +
          "🚔 القبض على 3 مطلوبين\n" +
          "💰 المكافأة: **$5,000**\n\n" +
          "استخدم `/mission` لمتابعة تقدمك.",
        ephemeral: true
      });
    }

    // JAIL
    if (interaction.commandName === "jail") {
      if (!police(member))
        return interaction.reply({ content: "❌ للشرطة فقط.", ephemeral: true });

      const target = interaction.options.getMember("user");
      const minutes = interaction.options.getInteger("minutes");

      if (!target)
        return interaction.reply({ content: "❌ العضو غير موجود.", ephemeral: true });

      const oldRoles = target.roles.cache
        .filter(r => r.id !== interaction.guild.id)
        .map(r => r.id);

      db.jail[target.id] = {
        ends: Date.now() + minutes * 60000,
        roles: oldRoles
      };

      await target.roles.set([config.roles.prisoner]);

      saveData(db);

      return interaction.reply(
        `⛓️ تم سجن ${target} لمدة **${minutes} دقيقة**.`
      );
    }

    // UNJAIL
    if (interaction.commandName === "unjail") {
      if (!police(member))
        return interaction.reply({ content: "❌ للشرطة فقط.", ephemeral: true });

      const target = interaction.options.getMember("user");

      if (!target || !db.jail[target.id])
        return interaction.reply({ content: "❌ العضو غير مسجون.", ephemeral: true });

      await target.roles.set(db.jail[target.id].roles);

      delete db.jail[target.id];
      saveData(db);

      return interaction.reply(`✅ تم فك سجن ${target}.`);
    }

    // WANTED
    if (interaction.commandName === "wanted") {
      if (!police(member))
        return interaction.reply({ content: "❌ للشرطة فقط.", ephemeral: true });

      const target = interaction.options.getUser("user");
      const reason = interaction.options.getString("reason");

      user(db, target.id).wanted = true;
      user(db, target.id).wantedReason = reason;

      saveData(db);

      return interaction.reply(
        `🚨 ${target} أصبح مطلوبًا.\n📋 السبب: **${reason}**`
      );
    }

    // UNWANTED
    if (interaction.commandName === "unwanted") {
      if (!police(member))
        return interaction.reply({ content: "❌ للشرطة فقط.", ephemeral: true });

      const target = interaction.options.getUser("user");

      user(db, target.id).wanted = false;
      user(db, target.id).wantedReason = null;

      saveData(db);

      return interaction.reply(`✅ تمت إزالة المطلوبية عن ${target}.`);
    }

    // ARREST
    if (interaction.commandName === "arrest") {
      if (!police(member))
        return interaction.reply({ content: "❌ للشرطة فقط.", ephemeral: true });

      const target = interaction.options.getUser("user");

      if (!user(db, target.id).wanted)
        return interaction.reply({ content: "❌ هذا اللاعب ليس مطلوبًا.", ephemeral: true });

      user(db, target.id).wanted = false;
      user(db, target.id).wantedReason = null;

      saveData(db);

      return interaction.reply(`🚔 تم القبض على ${target}.`);
    }

    // REPORT
    if (interaction.commandName === "report") {
      const text = interaction.options.getString("text");

      const rid = `report_${Date.now()}`;

      db.reports[rid] = {
        user: id,
        text,
        created: Date.now()
      };

      saveData(db);

      return interaction.reply({
        content: `🚨 تم إرسال البلاغ.\n🆔 رقم البلاغ: \`${rid}\``,
        ephemeral: true
      });
    }

    // ROB
    if (interaction.commandName === "rob") {
      if (!gangOf(db, id))
        return interaction.reply({ content: "❌ العصابات فقط.", ephemeral: true });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`rob_store_${id}`)
          .setLabel("🏪 سرقة متجر")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`rob_bank_${id}`)
          .setLabel("🏦 سرقة بنك")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`rob_drugs_${id}`)
          .setLabel("🌿 عملية حشيش")
          .setStyle(ButtonStyle.Success)
      );

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🔫 عمليات العصابة")
            .setDescription("اختر العملية:")
            .setColor(0xff0000)
        ],
        components: [row],
        ephemeral: true
      });
    }

    // MISSION
    if (interaction.commandName === "mission") {
      const p = police(member);

      return interaction.reply({
        content: p
          ? "🚔 مهمتك: القبض على 3 مطلوبين — 💰 المكافأة $5,000"
          : "🔫 مهمتك: تنفيذ 3 عمليات سرقة — 💰 المكافأة $5,000",
        ephemeral: true
      });
    }

  } catch (error) {
    console.error(error);

    if (!interaction.replied) {
      await interaction.reply({
        content: "❌ حدث خطأ. راجع سجل Railway.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

// =========================
// الأزرار
// =========================

client.on("interactionCreate", async interaction => {
  if (!interaction.isButton()) return;

  try {
    const db = dbInit(getData());

    // قبول عصابة
    if (interaction.customId.startsWith("ga_")) {
      const key = interaction.customId.slice(3);
      const inv = db.invites[key];

      if (!inv || inv.to !== interaction.user.id)
        return interaction.reply({ content: "❌ الدعوة غير صالحة.", ephemeral: true });

      const gang = db.gangs[inv.gangId];

      if (!gang)
        return interaction.reply({ content: "❌ العصابة غير موجودة.", ephemeral: true });

      if (gangOf(db, interaction.user.id))
        return interaction.reply({ content: "❌ أنت داخل عصابة.", ephemeral: true });

      gang.members.push(interaction.user.id);
      delete db.invites[key];

      const member = await interaction.guild.members.fetch(interaction.user.id);

      await giveRole(member, config.roles.gangMember);

      saveData(db);

      return interaction.update({
        content: `✅ انضممت إلى عصابة **${gang.name}**.\n🔫 تم إعطاؤك رتبة عضو العصابة.`,
        embeds: [],
        components: []
      });
    }

    // رفض عصابة
    if (interaction.customId.startsWith("gr_")) {
      const key = interaction.customId.slice(3);
      const inv = db.invites[key];

      if (!inv || inv.to !== interaction.user.id)
        return interaction.reply({ content: "❌ الدعوة غير صالحة.", ephemeral: true });

      delete db.invites[key];
      saveData(db);

      return interaction.update({
        content: "❌ تم رفض دعوة العصابة.",
        embeds: [],
        components: []
      });
    }

    // قبول شرطة
    if (interaction.customId.startsWith("pa_")) {
      const key = interaction.customId.slice(3);
      const inv = db.invites[key];

      if (!inv || inv.to !== interaction.user.id)
        return interaction.reply({ content: "❌ الدعوة غير صالحة.", ephemeral: true });

      const member = await interaction.guild.members.fetch(interaction.user.id);

      await giveRole(member, config.roles.policeOfficer);

      delete db.invites[key];
      saveData(db);

      return interaction.update({
        content: "✅ تم قبول الدعوة.\n🚔 تم إعطاؤك رتبة الشرطة.",
        embeds: [],
        components: []
      });
    }

    // رفض شرطة
    if (interaction.customId.startsWith("pr_")) {
      const key = interaction.customId.slice(3);
      const inv = db.invites[key];

      if (!inv || inv.to !== interaction.user.id)
        return interaction.reply({ content: "❌ الدعوة غير صالحة.", ephemeral: true });

      delete db.invites[key];
      saveData(db);

      return interaction.update({
        content: "❌ تم رفض دعوة الشرطة.",
        embeds: [],
        components: []
      });
    }

    // السرقة
    if (interaction.customId.startsWith("rob_")) {
      const parts = interaction.customId.split("_");
      const type = parts[1];
      const ownerId = parts[2];

      if (interaction.user.id !== ownerId)
        return interaction.reply({ content: "❌ هذا الزر ليس لك.", ephemeral: true });

      const result = gangOf(db, interaction.user.id);

      if (!result)
        return interaction.reply({ content: "❌ أنت لست بعصابة.", ephemeral: true });

      const chance = Math.random();

      if (chance < 0.35) {
        saveData(db);

        return interaction.update({
          content: "❌ فشلت عملية السرقة! حاول مرة أخرى لاحقًا.",
          embeds: [],
          components: []
        });
      }

      let reward = 0;

      if (type === "store") {
        reward = Math.floor(Math.random() * 5000) + 2000;
        result.gang.bank += reward;
        result.gang.storage.stolen++;
      }

      if (type === "bank") {
        reward = Math.floor(Math.random() * 20000) + 10000;
        result.gang.bank += reward;
        result.gang.storage.stolen += 5;
      }

      if (type === "drugs") {
        const weed = Math.floor(Math.random() * 10) + 5;
        result.gang.storage.weed += weed;

        saveData(db);

        return interaction.update({
          content: `✅ نجحت العملية!\n🌿 تمت إضافة **${weed} كغ** إلى مخزن العصابة.`,
          embeds: [],
          components: []
        });
      }

      saveData(db);

      return interaction.update({
        content:
          `✅ نجحت العملية!\n` +
          `💰 ربح العصابة: **$${money(reward)}**\n` +
          `📦 تمت إضافة المسروقات للمخزن.`,
        embeds: [],
        components: []
      });
    }

  } catch (error) {
    console.error("Button Error:", error);

    if (!interaction.replied) {
      await interaction.reply({
        content: "❌ حدث خطأ.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

// =========================
// فك السجن تلقائيًا
// =========================

setInterval(async () => {
  try {
    const db = dbInit(getData());
    let changed = false;

    for (const [id, jail] of Object.entries(db.jail)) {
      if (Date.now() >= jail.ends) {
        try {
          const guild = client.guilds.cache.first();

          if (guild) {
            const member = await guild.members.fetch(id).catch(() => null);

            if (member) {
              await member.roles.set(jail.roles);
            }
          }

          delete db.jail[id];
          changed = true;

          console.log(`✅ انتهى سجن ${id}`);
        } catch (e) {
          console.error("Jail Error:", e);
        }
      }
    }

    if (changed) saveData(db);

  } catch (e) {
    console.error("Auto Jail Error:", e);
  }
}, 30000);

// =========================
// تسجيل الدخول
// =========================

if (!process.env.TOKEN) {
  console.error("❌ TOKEN غير موجود في Environment Variables.");
  process.exit(1);
}

client.login(process.env.TOKEN);
