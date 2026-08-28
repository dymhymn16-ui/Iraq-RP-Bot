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
  return !!id && member.roles.cache.has(id);
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
  return !!(g && g.gang.leader === id);
}

function gangManagement(db, id) {
  const g = gangOf(db, id);
  return !!(g && (g.gang.leader === id || g.gang.deputy === id));
}

function money(n) {
  return Number(n || 0).toLocaleString();
}

async function giveRole(member, id) {
  if (id && !member.roles.cache.has(id)) {
    await member.roles.add(id);
  }
}

async function takeRole(member, id) {
  if (id && member.roles.cache.has(id)) {
    await member.roles.remove(id);
  }
}

// =========================
// الحرب
// =========================

const WAR_MIN = 4;
const WAR_MAX = 6;
const WAR_COOLDOWN = 5000;
const WAR_DURATION = 10 * 60 * 1000;

function getActiveWar(db, guildId) {
  return Object.values(db.wars).find(
    w => w.guildId === guildId && w.active
  );
}

function createWarId() {
  return `war_${Date.now()}_${Math.floor(Math.random() * 9999)}`;
}

function warTargetButtons(war, side) {
  const enemySide = side === "gang" ? "police" : "gang";
  const enemies = war[enemySide] || [];

  const buttons = enemies.slice(0, WAR_MAX).map(id =>
    new ButtonBuilder()
      .setCustomId(`warhit_${war.id}_${id}`)
      .setLabel(`🎯 ${id}`)
      .setStyle(ButtonStyle.Danger)
  );

  const rows = [];

  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(
      new ActionRowBuilder().addComponents(
        buttons.slice(i, i + 5)
      )
    );
  }

  return rows;
}

function warEmbed(war, guild) {
  const gangNames = war.gang
    .map(id => `<@${id}>`)
    .join("\n") || "لا يوجد";

  const policeNames = war.police
    .map(id => `<@${id}>`)
    .join("\n") || "لا يوجد";

  return new EmbedBuilder()
    .setTitle("⚔️ حرب الشرطة ضد العصابة")
    .setDescription(
      "🔥 **الحرب بدأت!**\n\n" +
      "كل لاعب يقدر يضغط على اسم من الفريق المقابل.\n" +
      "⏱️ يوجد انتظار **5 ثواني** بين كل هجوم.\n" +
      "🎲 كل هجوم يعطي من **1 إلى 20 نقطة**.\n\n" +
      `🟥 نقاط العصابة: **${war.gangScore}**\n` +
      `🟦 نقاط الشرطة: **${war.policeScore}**`
    )
    .addFields(
      {
        name: "🔫 العصابة",
        value: gangNames,
        inline: true
      },
      {
        name: "🚔 الشرطة",
        value: policeNames,
        inline: true
      }
    )
    .setFooter({
      text: `الحرب تستمر ${WAR_DURATION / 60000} دقائق`
    })
    .setTimestamp();
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
      o.setName("amount")
        .setDescription("المبلغ")
        .setRequired(true)
        .setMinValue(1)),

  new SlashCommandBuilder()
    .setName("removemoney")
    .setDescription("سحب أموال")
    .addUserOption(o =>
      o.setName("user").setDescription("العضو").setRequired(true))
    .addIntegerOption(o =>
      o.setName("amount")
        .setDescription("المبلغ")
        .setRequired(true)
        .setMinValue(1)),

  new SlashCommandBuilder()
    .setName("creategang")
    .setDescription("إنشاء عصابة")
    .addStringOption(o =>
      o.setName("name")
        .setDescription("اسم العصابة")
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName("ganginfo")
    .setDescription("معلومات العصابة"),

  new SlashCommandBuilder()
    .setName("ganginvite")
    .setDescription("دعوة عضو للعصابة")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("العضو")
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName("gangkick")
    .setDescription("طرد عضو من العصابة")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("العضو")
        .setRequired(true)),

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
      o.setName("user")
        .setDescription("العضو")
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName("policekick")
    .setDescription("طرد عضو من الشرطة")
    .addUserOption(o =>
      o.setName("
